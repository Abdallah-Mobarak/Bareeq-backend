const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Accountant Manager — FRD §2 + §4.2.2.2.1 §2.1.
 *
 * A company-scoped login that can see / report on a specific subset of
 * region scheduling records belonging to its parent Company. Two modes:
 *   - assignedToAllBranches = true   -> sees every RegionScheduling whose
 *                                       companyName matches the parent
 *                                       Company's nameAr or nameEn.
 *   - assignedToAllBranches = false  -> sees only the rows explicitly
 *                                       linked via the M:N join table.
 */

const serializeBranch = (rs) => ({
  id: rs.id,
  regionTitle: rs.regionTitle,
  branchName: rs.branchName,
  branchNumber: rs.branchNumber,
  city: rs.city,
  region: rs.region,
  code: rs.code,
});

const serializeAM = (u) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  nameAr: u.nameAr,
  nameEn: u.nameEn,
  status: u.status,
  companyId: u.companyId,
  company: u.company
    ? { id: u.company.id, nameAr: u.company.nameAr, nameEn: u.company.nameEn }
    : null,
  assignedToAllBranches: u.assignedToAllBranches,
  assignedBranches: (u.accountantBranchAssignments || []).map((a) =>
    serializeBranch(a.regionScheduling),
  ),
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

/**
 * Resolve the set of RegionScheduling rows that "belong to" a company,
 * by string match on companyName. Used to dynamically compute the
 * effective scope of an AM with assignedToAllBranches=true, and to
 * validate explicit ids are actually under the right company.
 */
const findBranchesUnderCompany = async (companyId, tx = prisma) => {
  const company = await tx.company.findFirst({
    where: { id: companyId, deletedAt: null },
  });
  if (!company) return [];

  const namesToMatch = [company.nameAr, company.nameEn].filter(Boolean);
  return tx.regionScheduling.findMany({
    where: {
      deletedAt: null,
      OR: namesToMatch.map((n) => ({
        companyName: { equals: n, mode: 'insensitive' },
      })),
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Throws if any of the requested region scheduling ids:
 *   - don't exist, or
 *   - belong to a different company (by name match), or
 *   - are already assigned to another AM in the same company.
 *
 * `excludeAccountantId` skips the conflict check for one AM — used
 * during update so an AM doesn't conflict with its own existing rows.
 */
const validateBranchAssignments = async ({
  companyId,
  regionSchedulingIds,
  excludeAccountantId = null,
  tx = prisma,
}) => {
  if (!regionSchedulingIds || regionSchedulingIds.length === 0) {
    return [];
  }

  const branchesUnderCompany = await findBranchesUnderCompany(companyId, tx);
  const validIds = new Set(branchesUnderCompany.map((b) => b.id));
  const notUnderCompany = regionSchedulingIds.filter((id) => !validIds.has(id));
  if (notUnderCompany.length > 0) {
    throw ApiError.badRequest(
      'Some branches do not belong to this company (companyName mismatch)',
      { notUnderCompany },
    );
  }

  // Conflict check (FR-52): don't allow the same branch to land under
  // two AMs in the same company at once.
  const conflicts = await tx.accountantManagerRegionScheduling.findMany({
    where: {
      regionSchedulingId: { in: regionSchedulingIds },
      ...(excludeAccountantId && { userId: { not: excludeAccountantId } }),
      user: { deletedAt: null, companyId },
    },
    include: { user: { select: { id: true, nameAr: true } } },
  });
  if (conflicts.length > 0) {
    throw ApiError.conflict('Some branches are already assigned to another accountant manager', {
      conflicts: conflicts.map((c) => ({
        regionSchedulingId: c.regionSchedulingId,
        ownerAccountantId: c.user.id,
        ownerAccountantName: c.user.nameAr,
      })),
    });
  }

  return regionSchedulingIds;
};

/**
 * Same conflict check, but for the all-branches mode: if the new AM is
 * "all branches", we must ensure no other AM in the same company has
 * any explicit assignments OR is also all-branches.
 */
const validateAllBranchesMode = async ({ companyId, excludeAccountantId = null, tx = prisma }) => {
  const otherAm = await tx.user.findFirst({
    where: {
      companyId,
      role: 'ACCOUNTANT_MANAGER',
      deletedAt: null,
      ...(excludeAccountantId && { id: { not: excludeAccountantId } }),
      OR: [
        { assignedToAllBranches: true },
        { accountantBranchAssignments: { some: {} } },
      ],
    },
  });
  if (otherAm) {
    throw ApiError.conflict(
      'Cannot use all-branches mode: another accountant manager already covers some or all branches under this company',
      { conflictingAccountantId: otherAm.id },
    );
  }
};

const createAccountantManager = async ({
  email,
  phone,
  password: plainPassword,
  nameAr,
  nameEn,
  companyId,
  assignedToAllBranches = false,
  regionSchedulingIds = [],
}) => {
  const conflict = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }], deletedAt: null },
  });
  if (conflict) {
    throw ApiError.conflict('Email or phone already in use');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
  });
  if (!company) {
    throw ApiError.badRequest('Company not found');
  }

  const passwordHash = await password.hash(plainPassword);

  const created = await prisma.$transaction(async (tx) => {
    if (assignedToAllBranches) {
      await validateAllBranchesMode({ companyId, tx });
    } else {
      if (!regionSchedulingIds.length) {
        throw ApiError.badRequest(
          'regionSchedulingIds is required when assignedToAllBranches is false',
        );
      }
      await validateBranchAssignments({ companyId, regionSchedulingIds, tx });
    }

    const user = await tx.user.create({
      data: {
        email,
        phone,
        password: passwordHash,
        role: 'ACCOUNTANT_MANAGER',
        status: 'ENABLED',
        nameAr,
        nameEn: nameEn || null,
        companyId,
        assignedToAllBranches,
      },
    });

    if (!assignedToAllBranches && regionSchedulingIds.length > 0) {
      await tx.accountantManagerRegionScheduling.createMany({
        data: regionSchedulingIds.map((regionSchedulingId) => ({
          userId: user.id,
          regionSchedulingId,
        })),
      });
    }

    return tx.user.findUnique({
      where: { id: user.id },
      include: {
        company: true,
        accountantBranchAssignments: {
          include: { regionScheduling: true },
        },
      },
    });
  });

  logger.info({ accountantId: created.id, companyId }, 'Accountant manager created');
  return serializeAM(created);
};

const listAccountantManagers = async ({
  page,
  limit,
  q,
  companyId,
  status,
  assignedToAllBranches,
  sort,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'ACCOUNTANT_MANAGER',
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    }),
    ...(companyId && { companyId }),
    ...(status && { status }),
    ...(assignedToAllBranches !== undefined && { assignedToAllBranches }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        company: true,
        accountantBranchAssignments: {
          include: { regionScheduling: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map(serializeAM),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Detail view also returns the *effective* branch scope: the explicit
 * assignments for fixed-mode AMs, or the dynamically resolved set of
 * company-matching RegionSchedulings for all-branches AMs. Saves the
 * frontend a separate roundtrip.
 */
const getAccountantManager = async (id) => {
  const user = await prisma.user.findFirst({
    where: { id, role: 'ACCOUNTANT_MANAGER', deletedAt: null },
    include: {
      company: true,
      accountantBranchAssignments: {
        include: { regionScheduling: true },
      },
    },
  });
  if (!user) {
    throw ApiError.notFound('Accountant manager not found');
  }

  const result = serializeAM(user);

  if (user.assignedToAllBranches && user.companyId) {
    const allBranches = await findBranchesUnderCompany(user.companyId);
    result.assignedBranches = allBranches.map(serializeBranch);
  }

  return result;
};

const updateAccountantManager = async (
  id,
  { email, phone, nameAr, nameEn, assignedToAllBranches, regionSchedulingIds },
) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ACCOUNTANT_MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Accountant manager not found');
  }

  if (email && email !== existing.email) {
    const conflict = await prisma.user.findFirst({
      where: { email, id: { not: id }, deletedAt: null },
    });
    if (conflict) {
      throw ApiError.conflict('Email already in use');
    }
  }
  if (phone && phone !== existing.phone) {
    const conflict = await prisma.user.findFirst({
      where: { phone, id: { not: id }, deletedAt: null },
    });
    if (conflict) {
      throw ApiError.conflict('Phone already in use');
    }
  }

  /**
   * The "scope" decision: are we toggling all-branches, or replacing
   * the explicit list, or just touching profile fields? We compute
   * the post-update mode and validate accordingly.
   */
  const nextAllBranches =
    assignedToAllBranches !== undefined ? assignedToAllBranches : existing.assignedToAllBranches;
  const explicitIdsProvided = regionSchedulingIds !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (assignedToAllBranches !== undefined && assignedToAllBranches !== existing.assignedToAllBranches) {
      if (nextAllBranches) {
        await validateAllBranchesMode({
          companyId: existing.companyId,
          excludeAccountantId: id,
          tx,
        });
      }
    }

    if (!nextAllBranches && explicitIdsProvided) {
      if (regionSchedulingIds.length === 0) {
        throw ApiError.badRequest(
          'regionSchedulingIds cannot be empty when assignedToAllBranches is false',
        );
      }
      await validateBranchAssignments({
        companyId: existing.companyId,
        regionSchedulingIds,
        excludeAccountantId: id,
        tx,
      });
    }

    await tx.user.update({
      where: { id },
      data: {
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(nameAr !== undefined && { nameAr }),
        ...(nameEn !== undefined && { nameEn: nameEn || null }),
        ...(assignedToAllBranches !== undefined && { assignedToAllBranches }),
      },
    });

    /**
     * Replace-all on the join table. Triggered when:
     *   - we just switched into all-branches mode (clear explicit rows), or
     *   - the caller passed an explicit new list while in fixed mode.
     */
    if (nextAllBranches && existing.assignedToAllBranches === false) {
      await tx.accountantManagerRegionScheduling.deleteMany({
        where: { userId: id },
      });
    } else if (!nextAllBranches && explicitIdsProvided) {
      await tx.accountantManagerRegionScheduling.deleteMany({
        where: { userId: id },
      });
      await tx.accountantManagerRegionScheduling.createMany({
        data: regionSchedulingIds.map((regionSchedulingId) => ({
          userId: id,
          regionSchedulingId,
        })),
      });
    }

    return tx.user.findUnique({
      where: { id },
      include: {
        company: true,
        accountantBranchAssignments: { include: { regionScheduling: true } },
      },
    });
  });

  logger.info({ accountantId: id }, 'Accountant manager updated');
  return serializeAM(updated);
};

const deleteAccountantManager = async (id) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ACCOUNTANT_MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Accountant manager not found');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
    // Drop assignments — soft-deleting the user is enough but keeping
    // orphan rows in the join table is just noise.
    prisma.accountantManagerRegionScheduling.deleteMany({
      where: { userId: id },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ accountantId: id }, 'Accountant manager soft-deleted');
};

const changeAccountantManagerPassword = async (id, newPassword) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ACCOUNTANT_MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Accountant manager not found');
  }

  const passwordHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ accountantId: id }, 'Accountant manager password reset by admin');
};

const updateAccountantManagerStatus = async (id, status) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ACCOUNTANT_MANAGER', deletedAt: null },
    include: {
      company: true,
      accountantBranchAssignments: { include: { regionScheduling: true } },
    },
  });
  if (!existing) {
    throw ApiError.notFound('Accountant manager not found');
  }

  if (existing.status === status) {
    return serializeAM(existing);
  }

  const ops = [
    prisma.user.update({
      where: { id },
      data: { status },
      include: {
        company: true,
        accountantBranchAssignments: { include: { regionScheduling: true } },
      },
    }),
  ];
  if (status === 'BLOCKED') {
    ops.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const [updated] = await prisma.$transaction(ops);
  logger.info({ accountantId: id, status }, 'Accountant manager status changed');
  return serializeAM(updated);
};

module.exports = {
  createAccountantManager,
  listAccountantManagers,
  getAccountantManager,
  updateAccountantManager,
  deleteAccountantManager,
  changeAccountantManagerPassword,
  updateAccountantManagerStatus,
  // Exported for the Assign Company composite flow:
  validateBranchAssignments,
  validateAllBranchesMode,
  findBranchesUnderCompany,
};

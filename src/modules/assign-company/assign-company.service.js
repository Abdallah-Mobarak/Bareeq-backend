const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');
const amService = require('../accountant-managers/accountant-managers.service');

/**
 * Assign Company flow — FRD §2.1.
 *
 * Companies are not created through a standalone CRUD; they emerge
 * from RegionScheduling.companyName uploaded by the admin (Excel or
 * manual). The dropdown returns every companyName that still needs
 * assignment work — either no login yet, or login exists but some
 * branches are not yet covered by an AM.
 *
 * POST /assign-company is therefore re-callable for the same company
 * across its lifetime: the first call creates the login + first AM(s),
 * every subsequent call just adds more AM(s) onto the existing
 * Company.
 */

const serializeAM = (u) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  nameAr: u.nameAr,
  nameEn: u.nameEn,
  assignedToAllBranches: u.assignedToAllBranches,
  assignedBranchCount: u._count?.accountantBranchAssignments ?? 0,
});

/**
 * Compute `unassignedBranches` for a Company — branches whose
 * companyName matches and that aren't yet covered by ANY AM (specific
 * row in the M:N table OR an all-branches AM under that Company).
 *
 * Returns 0 if the Company has an all-branches AM (everything covered).
 */
const countUnassignedBranches = async ({ companyId, companyName, totalBranches, tx = prisma }) => {
  if (!companyId) {
    return totalBranches;
  }

  const allBranchesAm = await tx.user.findFirst({
    where: {
      companyId,
      role: 'ACCOUNTANT_MANAGER',
      deletedAt: null,
      assignedToAllBranches: true,
    },
    select: { id: true },
  });
  if (allBranchesAm) {
    return 0;
  }

  const assignedCount = await tx.accountantManagerRegionScheduling.count({
    where: {
      regionScheduling: {
        companyName: { equals: companyName, mode: 'insensitive' },
        deletedAt: null,
      },
      user: {
        companyId,
        role: 'ACCOUNTANT_MANAGER',
        deletedAt: null,
      },
    },
  });

  return Math.max(totalBranches - assignedCount, 0);
};

const assignCompany = async ({ companyName, loginDetails, accountantManagers }) => {
  /**
   * Sanity check: the companyName must actually exist in the
   * RegionScheduling pool.
   */
  const sampleBranch = await prisma.regionScheduling.findFirst({
    where: {
      companyName: { equals: companyName, mode: 'insensitive' },
      deletedAt: null,
    },
  });
  if (!sampleBranch) {
    throw ApiError.badRequest(
      'No region schedulings found for this company name. Upload them first.',
    );
  }

  /**
   * Find existing Company + check login state. Drives whether
   * loginDetails is required for this call.
   */
  const existingCompany = await prisma.company.findFirst({
    where: {
      nameAr: { equals: companyName, mode: 'insensitive' },
      deletedAt: null,
    },
    include: {
      loginUsers: {
        where: { role: 'COMPANY_USER', deletedAt: null },
        select: { id: true, email: true, phone: true },
      },
    },
  });
  const hasLogin = (existingCompany?.loginUsers.length ?? 0) > 0;

  if (!hasLogin && !loginDetails) {
    throw ApiError.badRequest(
      'loginDetails is required for the first assignment of this company',
    );
  }

  /**
   * Pre-flight de-dup inside the request payload.
   * We only count emails/phones that we'll actually try to insert —
   * loginDetails is skipped if the company already has login.
   */
  const seenEmails = new Set();
  const seenPhones = new Set();
  const willCreateLogin = !hasLogin && !!loginDetails;
  if (willCreateLogin) {
    seenEmails.add(loginDetails.email);
    seenPhones.add(loginDetails.phone);
  }
  for (const am of accountantManagers || []) {
    if (seenEmails.has(am.email)) {
      throw ApiError.badRequest(`Duplicate email in request: ${am.email}`);
    }
    if (seenPhones.has(am.phone)) {
      throw ApiError.badRequest(`Duplicate phone in request: ${am.phone}`);
    }
    seenEmails.add(am.email);
    seenPhones.add(am.phone);
  }

  // Hash everything outside the tx — bcrypt is slow, keep DB lock window short.
  const loginPasswordHash = willCreateLogin ? await password.hash(loginDetails.password) : null;
  const amHashes = await Promise.all(
    (accountantManagers || []).map((am) => password.hash(am.password)),
  );

  const result = await prisma.$transaction(async (tx) => {
    /**
     * Step 1: ensure the Company exists. Either we found it above or
     * we create it now.
     */
    let company = existingCompany;
    if (!company) {
      company = await tx.company.create({
        data: {
          nameAr: companyName,
          nameEn: null,
        },
      });
    }

    /**
     * Step 2: cross-user uniqueness check INSIDE the tx for everything
     * we're about to create.
     */
    const allEmails = [...seenEmails];
    const allPhones = [...seenPhones];
    if (allEmails.length > 0) {
      const conflict = await tx.user.findFirst({
        where: {
          OR: [{ email: { in: allEmails } }, { phone: { in: allPhones } }],
          deletedAt: null,
        },
        select: { email: true, phone: true },
      });
      if (conflict) {
        throw ApiError.conflict(
          `Email or phone already in use: ${conflict.email} / ${conflict.phone}`,
        );
      }
    }

    /**
     * Step 3: if the company has no COMPANY_USER yet, create it.
     */
    let loginUser = null;
    if (willCreateLogin) {
      loginUser = await tx.user.create({
        data: {
          email: loginDetails.email,
          phone: loginDetails.phone,
          password: loginPasswordHash,
          role: 'COMPANY_USER',
          status: 'ENABLED',
          nameAr: companyName,
          nameEn: null,
          companyId: company.id,
        },
      });
    }

    /**
     * Step 4: create each Accountant Manager (FR-43..FR-52).
     */
    const createdAMs = [];
    for (let i = 0; i < (accountantManagers || []).length; i += 1) {
      const am = accountantManagers[i];
      const amHash = amHashes[i];

      if (am.assignedToAllBranches) {
        // eslint-disable-next-line no-await-in-loop
        await amService.validateAllBranchesMode({ companyId: company.id, tx });
      } else {
        if (!am.regionSchedulingIds?.length) {
          throw ApiError.badRequest(
            `AM ${am.email}: regionSchedulingIds is required when assignedToAllBranches is false`,
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await amService.validateBranchAssignments({
          companyId: company.id,
          regionSchedulingIds: am.regionSchedulingIds,
          tx,
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const createdAm = await tx.user.create({
        data: {
          email: am.email,
          phone: am.phone,
          password: amHash,
          role: 'ACCOUNTANT_MANAGER',
          status: 'ENABLED',
          nameAr: am.nameAr,
          nameEn: am.nameEn || null,
          companyId: company.id,
          assignedToAllBranches: !!am.assignedToAllBranches,
        },
      });

      if (!am.assignedToAllBranches && am.regionSchedulingIds?.length) {
        // eslint-disable-next-line no-await-in-loop
        await tx.accountantManagerRegionScheduling.createMany({
          data: am.regionSchedulingIds.map((regionSchedulingId) => ({
            userId: createdAm.id,
            regionSchedulingId,
          })),
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const reread = await tx.user.findUnique({
        where: { id: createdAm.id },
        include: { _count: { select: { accountantBranchAssignments: true } } },
      });
      createdAMs.push(reread);
    }

    return { company, loginUser, createdAMs };
  });

  logger.info(
    {
      companyId: result.company.id,
      companyName,
      loginCreated: !!result.loginUser,
      accountantManagersCreated: result.createdAMs.length,
    },
    'Assign Company flow completed',
  );

  return {
    company: {
      id: result.company.id,
      nameAr: result.company.nameAr,
      nameEn: result.company.nameEn,
      hasLogin: hasLogin || !!result.loginUser,
    },
    loginUser: result.loginUser
      ? {
          id: result.loginUser.id,
          email: result.loginUser.email,
          phone: result.loginUser.phone,
        }
      : null,
    accountantManagers: result.createdAMs.map(serializeAM),
  };
};

/**
 * Dropdown source for FR-32. Returns every companyName that still
 * needs work — no login yet, or login exists but at least one branch
 * isn't covered by any AM.
 *
 * Companies fully assigned (have login AND every branch covered)
 * are filtered out — they're "done".
 */
const listAvailableCompanies = async ({ q } = {}) => {
  const groups = await prisma.regionScheduling.groupBy({
    by: ['companyName'],
    where: {
      deletedAt: null,
      ...(q && { companyName: { contains: q, mode: 'insensitive' } }),
    },
    _count: { _all: true },
  });

  // Pull all matching companies in one go to avoid a per-name query.
  // Include the COMPANY_USER's email/phone so the FE can pre-fill /
  // display it on the "Assign Company" form when reopening a company
  // that already has login set up.
  const companyRows = await prisma.company.findMany({
    where: {
      deletedAt: null,
      OR: groups.map((g) => ({
        nameAr: { equals: g.companyName, mode: 'insensitive' },
      })),
    },
    include: {
      loginUsers: {
        where: { role: 'COMPANY_USER', deletedAt: null },
        select: { id: true, email: true, phone: true },
        take: 1,
      },
    },
  });
  const companyByName = new Map(
    companyRows.map((c) => [c.nameAr.toLowerCase(), c]),
  );

  const out = [];
  for (const g of groups) {
    const company = companyByName.get(g.companyName.toLowerCase()) || null;
    const loginUser = company?.loginUsers[0] || null;
    const hasLogin = !!loginUser;
    // eslint-disable-next-line no-await-in-loop
    const unassignedBranches = await countUnassignedBranches({
      companyId: company?.id || null,
      companyName: g.companyName,
      totalBranches: g._count._all,
    });

    // A company is "available" if it still needs work.
    if (!hasLogin || unassignedBranches > 0) {
      out.push({
        companyName: g.companyName,
        totalBranches: g._count._all,
        unassignedBranches,
        hasLogin,
        companyId: company?.id || null,
        loginUser: loginUser
          ? { email: loginUser.email, phone: loginUser.phone }
          : null,
      });
    }
  }

  return out.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ar'));
};

/**
 * FR-40 + the FE need: list every branch under a companyName, with a
 * flag telling the form which ones are already taken (so they can be
 * grayed-out in the checkbox list).
 */
const listCompanyBranches = async ({ companyName, q } = {}) => {
  const company = await prisma.company.findFirst({
    where: {
      nameAr: { equals: companyName, mode: 'insensitive' },
      deletedAt: null,
    },
    include: {
      loginUsers: {
        where: { role: 'COMPANY_USER', deletedAt: null },
        select: { id: true },
      },
    },
  });
  const hasLogin = (company?.loginUsers.length ?? 0) > 0;

  /**
   * If an AM under this company is set to assignedToAllBranches=true,
   * everything is implicitly assigned to them.
   */
  const allBranchesAm = company
    ? await prisma.user.findFirst({
        where: {
          companyId: company.id,
          role: 'ACCOUNTANT_MANAGER',
          deletedAt: null,
          assignedToAllBranches: true,
        },
        select: { id: true, email: true, nameAr: true },
      })
    : null;

  const branches = await prisma.regionScheduling.findMany({
    where: {
      deletedAt: null,
      companyName: { equals: companyName, mode: 'insensitive' },
      ...(q && {
        OR: [
          { branchName: { contains: q, mode: 'insensitive' } },
          { branchNumber: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { region: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      accountantAssignments: {
        where: {
          user: {
            ...(company && { companyId: company.id }),
            role: 'ACCOUNTANT_MANAGER',
            deletedAt: null,
          },
        },
        include: {
          user: {
            select: { id: true, email: true, nameAr: true },
          },
        },
      },
    },
  });

  const items = branches.map((rs) => {
    let isAssigned = false;
    let assignedTo = null;

    if (allBranchesAm) {
      isAssigned = true;
      assignedTo = {
        id: allBranchesAm.id,
        email: allBranchesAm.email,
        nameAr: allBranchesAm.nameAr,
        mode: 'allBranches',
      };
    } else if (rs.accountantAssignments.length > 0) {
      isAssigned = true;
      const am = rs.accountantAssignments[0].user;
      assignedTo = {
        id: am.id,
        email: am.email,
        nameAr: am.nameAr,
        mode: 'specific',
      };
    }

    return {
      id: rs.id,
      branchName: rs.branchName,
      branchNumber: rs.branchNumber,
      categoryName: rs.categoryName,
      city: rs.city,
      region: rs.region,
      address: rs.address,
      location: rs.location,
      latitude: rs.latitude,
      longitude: rs.longitude,
      code: rs.code,
      isAssigned,
      assignedTo,
    };
  });

  return {
    company: {
      id: company?.id ?? null,
      hasLogin,
    },
    items,
    total: items.length,
    unassignedCount: items.filter((b) => !b.isAssigned).length,
  };
};

module.exports = {
  assignCompany,
  listAvailableCompanies,
  listCompanyBranches,
};

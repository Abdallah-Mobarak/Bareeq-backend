const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Region Scheduling — FRD §4.2.2.2.1.
 *
 * Standalone entity. Its company / city / region / category fields are
 * STRINGS (not FKs into the catalog tables). Admin enters them directly,
 * typically via Excel import. Do not "improve" by switching to FKs.
 */

const serializeTask = (t) => ({
  id: t.id,
  visitType: t.visitType,
  titleAr: t.titleAr,
  titleEn: t.titleEn,
  sortOrder: t.sortOrder,
});

/**
 * Compute the visit-type list (V1..VN) from the numberOfVisits column.
 * The FRD wants this displayed alongside each record (FR-3).
 */
const visitTypesFor = (numberOfVisits) =>
  Array.from({ length: numberOfVisits }, (_, i) => `V${i + 1}`);

const serialize = (rs) => ({
  id: rs.id,
  regionTitle: rs.regionTitle,
  companyName: rs.companyName,
  branchName: rs.branchName,
  categoryName: rs.categoryName,
  branchNumber: rs.branchNumber,
  city: rs.city,
  region: rs.region,
  address: rs.address,
  latitude: rs.latitude,
  longitude: rs.longitude,
  numberOfVisits: rs.numberOfVisits,
  code: rs.code,
  visitTypes: visitTypesFor(rs.numberOfVisits),
  requiredTasks: (rs.requiredTasks || []).map(serializeTask),
  createdAt: rs.createdAt,
  updatedAt: rs.updatedAt,
});

/**
 * Validate the inline `requiredTasks` payload against `numberOfVisits`.
 * We accept tasks for visit types 1..numberOfVisits only — beyond that
 * is an admin error worth surfacing, not silently dropping.
 */
const validateTasks = (numberOfVisits, tasks) => {
  if (!tasks || tasks.length === 0) {
    return;
  }
  const overflow = tasks.filter((t) => t.visitType < 1 || t.visitType > numberOfVisits);
  if (overflow.length > 0) {
    throw ApiError.badRequest(
      'requiredTasks contains visitType values outside 1..numberOfVisits',
      { numberOfVisits, badEntries: overflow },
    );
  }
};

const create = async (input) => {
  validateTasks(input.numberOfVisits, input.requiredTasks);

  const created = await prisma.regionScheduling.create({
    data: {
      regionTitle: input.regionTitle,
      companyName: input.companyName,
      branchName: input.branchName,
      categoryName: input.categoryName || null,
      branchNumber: input.branchNumber || null,
      city: input.city,
      region: input.region,
      address: input.address || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      numberOfVisits: input.numberOfVisits,
      code: input.code || null,
      requiredTasks: input.requiredTasks?.length
        ? {
            create: input.requiredTasks.map((t, idx) => ({
              visitType: t.visitType,
              titleAr: t.titleAr,
              titleEn: t.titleEn || null,
              sortOrder: t.sortOrder ?? idx,
            })),
          }
        : undefined,
    },
    include: { requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] } },
  });

  logger.info({ id: created.id }, 'RegionScheduling created');
  return serialize(created);
};

/**
 * Bulk create — used by the Excel importer. All-or-nothing within a
 * single transaction so a partial failure doesn't leave half the rows
 * inserted. Returns the created records.
 */
const createMany = async (rows) => {
  for (const row of rows) {
    validateTasks(row.numberOfVisits, row.requiredTasks);
  }

  const created = await prisma.$transaction(
    rows.map((row) =>
      prisma.regionScheduling.create({
        data: {
          regionTitle: row.regionTitle,
          companyName: row.companyName,
          branchName: row.branchName,
          categoryName: row.categoryName || null,
          branchNumber: row.branchNumber || null,
          city: row.city,
          region: row.region,
          address: row.address || null,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          numberOfVisits: row.numberOfVisits,
          code: row.code || null,
          requiredTasks: row.requiredTasks?.length
            ? {
                create: row.requiredTasks.map((t, idx) => ({
                  visitType: t.visitType,
                  titleAr: t.titleAr,
                  titleEn: t.titleEn || null,
                  sortOrder: t.sortOrder ?? idx,
                })),
              }
            : undefined,
        },
        include: { requiredTasks: true },
      }),
    ),
  );

  logger.info({ count: created.length }, 'RegionScheduling bulk-created');
  return created.map(serialize);
};

const list = async ({
  page,
  limit,
  q,
  region,
  companyName,
  branchName,
  categoryName,
  branchNumber,
  city,
  visitType,
  code,
  sort,
}) => {
  const skip = (page - 1) * limit;

  /**
   * `q` is a free-text search across most string fields (FR-28).
   * Specific filters are AND'd on top.
   */
  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { regionTitle: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { branchName: { contains: q, mode: 'insensitive' } },
        { categoryName: { contains: q, mode: 'insensitive' } },
        { branchNumber: { contains: q } },
        { city: { contains: q, mode: 'insensitive' } },
        { region: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(region && { region: { contains: region, mode: 'insensitive' } }),
    ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
    ...(branchName && { branchName: { contains: branchName, mode: 'insensitive' } }),
    ...(categoryName && { categoryName: { contains: categoryName, mode: 'insensitive' } }),
    ...(branchNumber && { branchNumber }),
    ...(city && { city: { contains: city, mode: 'insensitive' } }),
    ...(code && { code }),
    /**
     * Visit-type filter (FR-24): "show me records that have a V<n>".
     * Since visit types are derived from numberOfVisits, that means
     * numberOfVisits >= n.
     */
    ...(visitType && { numberOfVisits: { gte: visitType } }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.regionScheduling.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] },
      },
    }),
    prisma.regionScheduling.count({ where }),
  ]);

  return {
    items: items.map(serialize),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /region-schedulings/:id — returns the row plus everything tied
 * to it across the system:
 *   - Company entity (matched by name) + its login user
 *   - Accountant managers covering this branch:
 *       • specific assignments via the M:N table
 *       • all-branches AMs under the same company (implicit coverage)
 *   - Scheduled visits, with supervisor and visit instances
 *
 * The FE uses this for the "branch detail" view where the admin needs
 * to see at a glance who's responsible for this branch and what's on
 * the calendar.
 */
const getOne = async (id) => {
  const rs = await prisma.regionScheduling.findFirst({
    where: { id, deletedAt: null },
    include: {
      requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] },
      accountantAssignments: {
        where: { user: { deletedAt: null, role: 'ACCOUNTANT_MANAGER' } },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              nameAr: true,
              nameEn: true,
              status: true,
              assignedToAllBranches: true,
            },
          },
        },
      },
      scheduledVisits: {
        where: { deletedAt: null },
        include: {
          monthlySchedule: {
            include: {
              supervisor: {
                select: {
                  id: true,
                  email: true,
                  phone: true,
                  nameAr: true,
                  nameEn: true,
                  status: true,
                },
              },
            },
          },
          visitInstances: {
            where: { deletedAt: null },
            orderBy: { visitOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!rs) {
    throw ApiError.notFound('Region scheduling not found');
  }

  // The Company entity is matched by name (companyName is a string,
  // not an FK — by design). It might not exist yet if the admin hasn't
  // assigned this company.
  const company = await prisma.company.findFirst({
    where: {
      nameAr: { equals: rs.companyName, mode: 'insensitive' },
      deletedAt: null,
    },
    include: {
      loginUsers: {
        where: { role: 'COMPANY_USER', deletedAt: null },
        select: { id: true, email: true, phone: true, status: true },
        take: 1,
      },
    },
  });

  // All-branches AMs under this company implicitly cover this branch
  // even though there's no row in the M:N table for them.
  const allBranchesAms = company
    ? await prisma.user.findMany({
        where: {
          companyId: company.id,
          role: 'ACCOUNTANT_MANAGER',
          deletedAt: null,
          assignedToAllBranches: true,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          nameAr: true,
          nameEn: true,
          status: true,
          assignedToAllBranches: true,
        },
      })
    : [];

  const specificAms = rs.accountantAssignments.map((a) => ({
    id: a.user.id,
    email: a.user.email,
    phone: a.user.phone,
    nameAr: a.user.nameAr,
    nameEn: a.user.nameEn,
    status: a.user.status,
    mode: 'specific',
  }));
  const allBranchesAmsSerialized = allBranchesAms.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone,
    nameAr: u.nameAr,
    nameEn: u.nameEn,
    status: u.status,
    mode: 'allBranches',
  }));

  const accountantManagers = [...specificAms, ...allBranchesAmsSerialized];

  const scheduledVisits = rs.scheduledVisits.map((sv) => ({
    id: sv.id,
    monthlyScheduleId: sv.monthlyScheduleId,
    type: sv.type,
    year: sv.monthlySchedule?.year,
    month: sv.monthlySchedule?.month,
    publishedAt: sv.monthlySchedule?.publishedAt,
    supervisor: sv.monthlySchedule?.supervisor || null,
    numberOfVisits: sv.numberOfVisits,
    firstVisitDate: sv.firstVisitDate,
    instances: (sv.visitInstances || []).map((i) => ({
      id: i.id,
      visitOrder: i.visitOrder,
      scheduledDate: i.scheduledDate,
      status: i.status,
      documentationStatus: i.documentationStatus,
      lockedAt: i.lockedAt,
    })),
  }));

  return {
    ...serialize(rs),
    company: company
      ? {
          id: company.id,
          nameAr: company.nameAr,
          nameEn: company.nameEn,
          loginUser: company.loginUsers[0] || null,
        }
      : null,
    accountantManagers,
    scheduledVisits,
  };
};

/**
 * Update is replace-all on requiredTasks if provided — same reasoning
 * as PermissionRole: simpler than diffing add/remove sets, and tasks
 * carry no state worth preserving.
 */
const update = async (id, input) => {
  const existing = await prisma.regionScheduling.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Region scheduling not found');
  }

  const newNumberOfVisits =
    input.numberOfVisits !== undefined ? input.numberOfVisits : existing.numberOfVisits;
  if (input.requiredTasks !== undefined) {
    validateTasks(newNumberOfVisits, input.requiredTasks);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.regionScheduling.update({
      where: { id },
      data: {
        ...(input.regionTitle !== undefined && { regionTitle: input.regionTitle }),
        ...(input.companyName !== undefined && { companyName: input.companyName }),
        ...(input.branchName !== undefined && { branchName: input.branchName }),
        ...(input.categoryName !== undefined && { categoryName: input.categoryName || null }),
        ...(input.branchNumber !== undefined && { branchNumber: input.branchNumber || null }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.region !== undefined && { region: input.region }),
        ...(input.address !== undefined && { address: input.address || null }),
        ...(input.latitude !== undefined && { latitude: input.latitude ?? null }),
        ...(input.longitude !== undefined && { longitude: input.longitude ?? null }),
        ...(input.numberOfVisits !== undefined && { numberOfVisits: input.numberOfVisits }),
        ...(input.code !== undefined && { code: input.code || null }),
      },
    });

    if (input.requiredTasks !== undefined) {
      await tx.regionSchedulingTask.deleteMany({ where: { regionSchedulingId: id } });
      if (input.requiredTasks.length > 0) {
        await tx.regionSchedulingTask.createMany({
          data: input.requiredTasks.map((t, idx) => ({
            regionSchedulingId: id,
            visitType: t.visitType,
            titleAr: t.titleAr,
            titleEn: t.titleEn || null,
            sortOrder: t.sortOrder ?? idx,
          })),
        });
      }
    }

    return tx.regionScheduling.findUnique({
      where: { id },
      include: {
        requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
  });

  logger.info({ id }, 'RegionScheduling updated');
  return serialize(updated);
};

/**
 * Soft delete. Refuses if there are any ScheduledVisits referencing
 * this row — the admin must reschedule or cancel those first.
 */
const remove = async (id) => {
  const existing = await prisma.regionScheduling.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Region scheduling not found');
  }

  const linkedVisits = await prisma.scheduledVisit.count({
    where: { regionSchedulingId: id, deletedAt: null },
  });
  if (linkedVisits > 0) {
    throw ApiError.conflict(
      'Cannot delete: this record has scheduled visits. Cancel or reassign them first.',
      { linkedVisits },
    );
  }

  await prisma.regionScheduling.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ id }, 'RegionScheduling soft-deleted');
};

module.exports = {
  create,
  createMany,
  list,
  getOne,
  update,
  remove,
};

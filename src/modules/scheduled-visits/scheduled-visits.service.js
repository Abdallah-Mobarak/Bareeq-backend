const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Scheduled Visits — flat per-branch listing across every monthly
 * schedule (FRD §4.2.2.2.2).
 *
 * Each row in the response = one ScheduledVisit, which is one branch
 * inside one supervisor's monthly schedule. Visit instances (V1..Vn)
 * are nested inside, so the FE can render the V1/V2/V3/V4 column.
 *
 * This is a read-only admin view — no create/update/delete. Schedules
 * are managed via /monthly-schedules.
 */

const visitTypesFor = (n) => Array.from({ length: n }, (_, i) => `V${i + 1}`);

const serializeRow = (sv) => ({
  id: sv.id,
  monthlyScheduleId: sv.monthlyScheduleId,
  year: sv.monthlySchedule?.year,
  month: sv.monthlySchedule?.month,
  publishedAt: sv.monthlySchedule?.publishedAt,

  supervisor: sv.monthlySchedule?.supervisor
    ? {
        id: sv.monthlySchedule.supervisor.id,
        email: sv.monthlySchedule.supervisor.email,
        phone: sv.monthlySchedule.supervisor.phone,
        nameAr: sv.monthlySchedule.supervisor.nameAr,
        nameEn: sv.monthlySchedule.supervisor.nameEn,
        status: sv.monthlySchedule.supervisor.status,
      }
    : null,

  regionScheduling: sv.regionScheduling
    ? {
        id: sv.regionScheduling.id,
        companyName: sv.regionScheduling.companyName,
        branchName: sv.regionScheduling.branchName,
        categoryName: sv.regionScheduling.categoryName,
        branchNumber: sv.regionScheduling.branchNumber,
        city: sv.regionScheduling.city,
        region: sv.regionScheduling.region,
        address: sv.regionScheduling.address,
        location: sv.regionScheduling.location,
        latitude: sv.regionScheduling.latitude,
        longitude: sv.regionScheduling.longitude,
        numberOfVisits: sv.regionScheduling.numberOfVisits,
        code: sv.regionScheduling.code,
        visitTypes: visitTypesFor(sv.regionScheduling.numberOfVisits),
        requiredTasks: (sv.regionScheduling.requiredTasks || []).map((t) => ({
          id: t.id,
          visitType: t.visitType,
          titleAr: t.titleAr,
          titleEn: t.titleEn,
          sortOrder: t.sortOrder,
        })),
      }
    : null,

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
});

/**
 * Build the Prisma `where` clause from query filters. Pulled out
 * because the same shape is reused for the count query.
 */
const buildWhere = (query) => {
  const {
    q,
    supervisorId,
    supervisorName,
    companyName,
    branchName,
    categoryName,
    branchNumber,
    city,
    region,
    code,
    visitType,
    dateFrom,
    dateTo,
    year,
    month,
  } = query;

  const where = {
    deletedAt: null,
    monthlySchedule: {
      deletedAt: null,
      ...(supervisorId && { supervisorId }),
      ...(year !== undefined && { year }),
      ...(month !== undefined && { month }),
      ...(supervisorName && {
        supervisor: {
          OR: [
            { nameAr: { contains: supervisorName, mode: 'insensitive' } },
            { nameEn: { contains: supervisorName, mode: 'insensitive' } },
          ],
        },
      }),
    },
    regionScheduling: {
      deletedAt: null,
      ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
      ...(branchName && { branchName: { contains: branchName, mode: 'insensitive' } }),
      ...(categoryName && { categoryName: { contains: categoryName, mode: 'insensitive' } }),
      ...(branchNumber && { branchNumber: { contains: branchNumber } }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(region && { region: { contains: region, mode: 'insensitive' } }),
      ...(code && { code: { contains: code, mode: 'insensitive' } }),
      ...(visitType && { numberOfVisits: { gte: visitType } }),
    },
  };

  /**
   * Free-text search across supervisor + region scheduling string
   * fields. Implemented as an `AND` with two OR sub-clauses so that
   * a hit anywhere in either entity matches.
   */
  if (q) {
    where.AND = [
      {
        OR: [
          {
            monthlySchedule: {
              supervisor: {
                OR: [
                  { nameAr: { contains: q, mode: 'insensitive' } },
                  { nameEn: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
          {
            regionScheduling: {
              OR: [
                { companyName: { contains: q, mode: 'insensitive' } },
                { branchName: { contains: q, mode: 'insensitive' } },
                { categoryName: { contains: q, mode: 'insensitive' } },
                { branchNumber: { contains: q } },
                { city: { contains: q, mode: 'insensitive' } },
                { region: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        ],
      },
    ];
  }

  /**
   * Date-range filter applies to the visit instances themselves, not
   * to firstVisitDate. The query "show me everything in week 2" must
   * match V2 even if V1 is in week 1.
   */
  if (dateFrom || dateTo) {
    where.visitInstances = {
      some: {
        deletedAt: null,
        ...(dateFrom && { scheduledDate: { gte: new Date(dateFrom) } }),
        ...(dateTo && { scheduledDate: { lte: new Date(dateTo) } }),
        ...(dateFrom && dateTo && {
          scheduledDate: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo),
          },
        }),
      },
    };
  }

  return where;
};

const list = async (query) => {
  const { page, limit, sort } = query;
  const skip = (page - 1) * limit;
  const where = buildWhere(query);

  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'date'
        ? { firstVisitDate: 'asc' }
        : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.scheduledVisit.findMany({
      where,
      skip,
      take: limit,
      orderBy,
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
        regionScheduling: {
          include: {
            requiredTasks: {
              orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
            },
          },
        },
        visitInstances: {
          where: { deletedAt: null },
          orderBy: { visitOrder: 'asc' },
        },
      },
    }),
    prisma.scheduledVisit.count({ where }),
  ]);

  return {
    items: items.map(serializeRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * FR-... §4.2.2.2.2: "View the total number of branches assigned to a
 * supervisor in the scheduling month."
 *
 * If `supervisorId` is given, returns one row for that supervisor.
 * Otherwise groups by supervisor for the whole (year, month).
 */
const summary = async ({ supervisorId, year, month }) => {
  const baseWhere = {
    deletedAt: null,
    monthlySchedule: {
      deletedAt: null,
      year,
      month,
      ...(supervisorId && { supervisorId }),
    },
  };

  const items = await prisma.scheduledVisit.findMany({
    where: baseWhere,
    include: {
      monthlySchedule: {
        include: {
          supervisor: {
            select: { id: true, nameAr: true, nameEn: true, email: true },
          },
        },
      },
      visitInstances: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

  // Group in JS — small dataset (one month). If this ever scales we
  // switch to a raw SQL aggregation.
  const buckets = new Map();
  for (const sv of items) {
    const sup = sv.monthlySchedule.supervisor;
    if (!buckets.has(sup.id)) {
      buckets.set(sup.id, {
        supervisor: sup,
        branchCount: 0,
        totalInstances: 0,
      });
    }
    const b = buckets.get(sup.id);
    b.branchCount += 1;
    b.totalInstances += sv.visitInstances.length;
  }

  return {
    year,
    month,
    items: [...buckets.values()].sort((a, b) =>
      (a.supervisor.nameAr || '').localeCompare(b.supervisor.nameAr || '', 'ar'),
    ),
  };
};

module.exports = {
  list,
  summary,
};

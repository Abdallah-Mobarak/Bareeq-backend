const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Supervisor mobile-side schedule reads — FRD §1.2.
 *
 * The supervisor only ever sees their own schedule. We scope every
 * query by `supervisorId = req.user.id`; the supervisor can't even
 * peek at someone else's branches.
 *
 * "Past schedules are read-only" (§1.2 intro): we don't enforce that
 * here; it surfaces in the visit-execution module where edits are
 * blocked once a terminal status is reached. The supervisor *can*
 * VIEW past schedules, just not modify them.
 */

const visitTypesFor = (n) => Array.from({ length: n }, (_, i) => `V${i + 1}`);

const serializeBranchRow = (sv) => ({
  id: sv.id,
  monthlyScheduleId: sv.monthlyScheduleId,
  year: sv.monthlySchedule?.year,
  month: sv.monthlySchedule?.month,

  regionScheduling: sv.regionScheduling
    ? {
        id: sv.regionScheduling.id,
        regionTitle: sv.regionScheduling.regionTitle,
        companyName: sv.regionScheduling.companyName,
        branchName: sv.regionScheduling.branchName,
        categoryName: sv.regionScheduling.categoryName,
        branchNumber: sv.regionScheduling.branchNumber,
        city: sv.regionScheduling.city,
        region: sv.regionScheduling.region,
        address: sv.regionScheduling.address,
        latitude: sv.regionScheduling.latitude,
        longitude: sv.regionScheduling.longitude,
        numberOfVisits: sv.regionScheduling.numberOfVisits,
        code: sv.regionScheduling.code,
        visitTypes: visitTypesFor(sv.regionScheduling.numberOfVisits),
      }
    : null,

  numberOfVisits: sv.numberOfVisits,
  firstVisitDate: sv.firstVisitDate,

  /**
   * Each instance carries its own status. Drives the supervisor's
   * branch list UI (e.g. "V1 done, V2 underway").
   */
  instances: (sv.visitInstances || []).map((i) => ({
    id: i.id,
    visitOrder: i.visitOrder,
    scheduledDate: i.scheduledDate,
    status: i.status,
    documentationStatus: i.documentationStatus,
  })),
});

const monthBoundsUTC = (year, month) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const buildWhere = (supervisorId, query) => {
  const {
    q,
    companyName,
    branchName,
    categoryName,
    branchNumber,
    city,
    region,
    code,
    visitType,
    numberOfVisits,
    dateFrom,
    dateTo,
    year,
    month,
  } = query;

  const where = {
    deletedAt: null,
    monthlySchedule: {
      deletedAt: null,
      supervisorId,
      ...(year !== undefined && { year }),
      ...(month !== undefined && { month }),
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
      ...(numberOfVisits && { numberOfVisits }),
    },
  };

  if (q) {
    where.regionScheduling.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { branchName: { contains: q, mode: 'insensitive' } },
      { categoryName: { contains: q, mode: 'insensitive' } },
      { branchNumber: { contains: q } },
      { city: { contains: q, mode: 'insensitive' } },
      { region: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (dateFrom || dateTo) {
    where.visitInstances = {
      some: {
        deletedAt: null,
        ...(dateFrom && dateTo
          ? { scheduledDate: { gte: new Date(dateFrom), lte: new Date(dateTo) } }
          : dateFrom
            ? { scheduledDate: { gte: new Date(dateFrom) } }
            : { scheduledDate: { lte: new Date(dateTo) } }),
      },
    };
  }

  return where;
};

/**
 * GET /supervisor/my-schedule/branches
 * The list view (FRD §1.2.1). Defaults to "this month" so the mobile
 * app doesn't need to compute it.
 */
const listMyBranches = async (supervisorId, rawQuery) => {
  const now = new Date();
  const query = {
    ...rawQuery,
    year: rawQuery.year ?? now.getUTCFullYear(),
    month: rawQuery.month ?? now.getUTCMonth() + 1,
  };

  const where = buildWhere(supervisorId, query);
  const { page, limit, sort, nearestLat, nearestLng } = query;

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'newest') orderBy = { createdAt: 'desc' };
  else orderBy = { firstVisitDate: 'asc' };

  const [items, total] = await prisma.$transaction([
    prisma.scheduledVisit.findMany({
      where,
      orderBy,
      // Nearest sort is done in JS after the fetch; otherwise we paginate
      // before computing distance and lose ordering.
      ...(sort === 'nearest' ? {} : { skip: (page - 1) * limit, take: limit }),
      include: {
        monthlySchedule: { select: { year: true, month: true } },
        regionScheduling: true,
        visitInstances: {
          where: { deletedAt: null },
          orderBy: { visitOrder: 'asc' },
        },
      },
    }),
    prisma.scheduledVisit.count({ where }),
  ]);

  let rows = items;
  if (sort === 'nearest' && nearestLat !== undefined && nearestLng !== undefined) {
    rows = items
      .map((sv) => {
        const lat = sv.regionScheduling?.latitude;
        const lng = sv.regionScheduling?.longitude;
        const distance =
          lat !== null && lng !== null && lat !== undefined && lng !== undefined
            ? haversineMeters(Number(nearestLat), Number(nearestLng), Number(lat), Number(lng))
            : Number.POSITIVE_INFINITY;
        return { ...sv, _distance: distance };
      })
      .sort((a, b) => a._distance - b._distance)
      .slice((page - 1) * limit, (page - 1) * limit + limit);
  }

  return {
    items: rows.map(serializeBranchRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /supervisor/my-schedule
 * Lightweight overview: month + total branches assigned. FRD §1.2.1
 * "Display a total number of branches he will visit during this month."
 */
const myScheduleSummary = async (supervisorId, { year, month }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  const schedule = await prisma.monthlySchedule.findFirst({
    where: { supervisorId, year: y, month: m, deletedAt: null },
    include: {
      _count: {
        select: { scheduledVisits: { where: { deletedAt: null } } },
      },
    },
  });

  if (!schedule) {
    return { year: y, month: m, scheduleId: null, branchCount: 0 };
  }

  return {
    year: y,
    month: m,
    scheduleId: schedule.id,
    branchCount: schedule._count.scheduledVisits,
    publishedAt: schedule.publishedAt,
  };
};

/**
 * GET /supervisor/branches/:id (where :id = ScheduledVisit id)
 *
 * Branch detail with full visit-instance state — FRD §1.2.4.
 * Includes per-instance status, photos, and task checks so the
 * mobile app can render the visit timeline.
 */
const getMyBranchDetail = async (supervisorId, scheduledVisitId) => {
  const sv = await prisma.scheduledVisit.findFirst({
    where: {
      id: scheduledVisitId,
      deletedAt: null,
      monthlySchedule: { supervisorId, deletedAt: null },
    },
    include: {
      monthlySchedule: { select: { year: true, month: true, supervisorId: true } },
      regionScheduling: {
        include: {
          requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] },
        },
      },
      visitInstances: {
        where: { deletedAt: null },
        orderBy: { visitOrder: 'asc' },
        include: {
          notImplementedReason: { select: { id: true, titleAr: true, titleEn: true } },
          photos: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
          taskChecks: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!sv) {
    throw ApiError.notFound('Branch not found in your schedule');
  }

  return {
    id: sv.id,
    monthlyScheduleId: sv.monthlyScheduleId,
    year: sv.monthlySchedule?.year,
    month: sv.monthlySchedule?.month,
    regionScheduling: {
      id: sv.regionScheduling.id,
      regionTitle: sv.regionScheduling.regionTitle,
      companyName: sv.regionScheduling.companyName,
      branchName: sv.regionScheduling.branchName,
      categoryName: sv.regionScheduling.categoryName,
      branchNumber: sv.regionScheduling.branchNumber,
      city: sv.regionScheduling.city,
      region: sv.regionScheduling.region,
      address: sv.regionScheduling.address,
      latitude: sv.regionScheduling.latitude,
      longitude: sv.regionScheduling.longitude,
      numberOfVisits: sv.regionScheduling.numberOfVisits,
      code: sv.regionScheduling.code,
      visitTypes: visitTypesFor(sv.regionScheduling.numberOfVisits),
      requiredTasks: sv.regionScheduling.requiredTasks.map((t) => ({
        id: t.id,
        visitType: t.visitType,
        titleAr: t.titleAr,
        titleEn: t.titleEn,
        sortOrder: t.sortOrder,
      })),
    },
    numberOfVisits: sv.numberOfVisits,
    firstVisitDate: sv.firstVisitDate,
    instances: sv.visitInstances.map((i) => ({
      id: i.id,
      visitOrder: i.visitOrder,
      scheduledDate: i.scheduledDate,
      status: i.status,
      documentationStatus: i.documentationStatus,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      durationSeconds: i.durationSeconds,
      startLatitude: i.startLatitude,
      startLongitude: i.startLongitude,
      lockedAt: i.lockedAt,
      notImplementedReason: i.notImplementedReason,
      branchManagerPhone: i.branchManagerPhone,
      jobNumber: i.jobNumber,
      rating: i.rating,
      comments: i.comments,
      documentedAt: i.documentedAt,
      photos: i.photos.map((p) => ({
        id: p.id,
        url: p.url,
        sizeBytes: p.sizeBytes,
        mimeType: p.mimeType,
        uploadedAt: p.uploadedAt,
      })),
      taskChecks: i.taskChecks.map((tc) => ({
        id: tc.id,
        regionSchedulingTaskId: tc.regionSchedulingTaskId,
        titleAr: tc.titleAr,
        titleEn: tc.titleEn,
        done: tc.done,
      })),
    })),
  };
};

module.exports = {
  myScheduleSummary,
  listMyBranches,
  getMyBranchDetail,
  monthBoundsUTC,
};

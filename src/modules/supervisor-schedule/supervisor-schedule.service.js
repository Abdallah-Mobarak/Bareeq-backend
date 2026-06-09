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
    address,
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
      ...(address && { address: { contains: address, mode: 'insensitive' } }),
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
      { address: { contains: q, mode: 'insensitive' } },
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
      notImplementedNote: i.notImplementedNote,
      visitNote: i.visitNote,
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

/**
 * GET /supervisor/performance — Monthly Time Distribution (FRD §1.3).
 *
 * The supervisor "Performance" tab. Aggregates the supervisor's own visit
 * instances for one month into:
 *   - `overview`  : the flat KPI cards (branches, total visits, implemented,
 *                   not-visited, closed, not-implemented, documented,
 *                   undocumented, days worked).
 *   - `companies` : one entry per company with the same totals PLUS a
 *                   per-visit-type (V1..Vn) breakdown and that visit type's
 *                   start/end date (min/max scheduled date).
 *
 * Filters (FRD §1.3.2): companyName, city, visitType, date range. Defaults
 * to the current UTC month. Everything is scoped to `supervisorId` so a
 * supervisor only ever sees their own numbers.
 *
 * Status → KPI mapping:
 *   IMPLEMENTED → implemented · REMAINING → notVisited · UNDERWAY → underway
 *   FINAL_CLOSED → finalClosed · NOT_IMPLEMENTED → notImplemented
 * "Days worked" = distinct calendar days (UTC) on which a visit was started.
 */
const STATUS_KEY = {
  IMPLEMENTED: 'implemented',
  REMAINING: 'notVisited',
  UNDERWAY: 'underway',
  FINAL_CLOSED: 'finalClosed',
  NOT_IMPLEMENTED: 'notImplemented',
};

const newCounters = () => ({
  totalVisits: 0,
  implemented: 0,
  notVisited: 0,
  underway: 0,
  finalClosed: 0,
  notImplemented: 0,
  documented: 0,
  undocumented: 0,
});

/**
 * Map a company's `perVisitType` map ({ V1: counters, V2: ... }) into the
 * per-version status rows the "Hourglass" / Performance screen consumes:
 *   [{ version, done, pending, closed, notDone, documented, undocumented, total }]
 * Only the versions actually present in the schedule are emitted, sorted V1→Vn.
 */
const versionBreakdown = (perVisitType = {}) =>
  Object.keys(perVisitType)
    .sort()
    .map((vt) => {
      const m = perVisitType[vt];
      return {
        version: Number(vt.replace(/^V/i, '')) || vt,
        done: m.implemented,
        pending: m.notVisited,
        closed: m.finalClosed,
        notDone: m.notImplemented,
        documented: m.documented,
        undocumented: m.undocumented,
        total: m.totalVisits,
      };
    });

const tallyInstance = (counters, inst) => {
  counters.totalVisits += 1;
  const key = STATUS_KEY[inst.status];
  if (key) {
    counters[key] += 1;
  }
  if (inst.documentationStatus === 'DOCUMENTED') {
    counters.documented += 1;
  } else {
    counters.undocumented += 1;
  }
};

const dayStamp = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const getMyPerformance = async (supervisorId, rawQuery = {}) => {
  const now = new Date();
  const year = rawQuery.year ?? now.getUTCFullYear();
  const month = rawQuery.month ?? now.getUTCMonth() + 1;
  const { companyName, city, visitType, dateFrom, dateTo } = rawQuery;

  const where = {
    deletedAt: null,
    ...(visitType && { visitOrder: visitType }),
    ...((dateFrom || dateTo) && {
      scheduledDate: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
    scheduledVisit: {
      deletedAt: null,
      monthlySchedule: { supervisorId, year, month, deletedAt: null },
      regionScheduling: {
        deletedAt: null,
        ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
      },
    },
  };

  const instances = await prisma.visitInstance.findMany({
    where,
    select: {
      visitOrder: true,
      status: true,
      documentationStatus: true,
      scheduledDate: true,
      startedAt: true,
      scheduledVisitId: true,
      scheduledVisit: {
        select: { regionScheduling: { select: { companyName: true } } },
      },
    },
  });

  const overview = newCounters();
  const overviewBranches = new Set();
  const overviewDays = new Set();
  const companyMap = new Map();

  for (const inst of instances) {
    const company = inst.scheduledVisit?.regionScheduling?.companyName || '—';
    const day = inst.startedAt ? dayStamp(inst.startedAt) : null;

    tallyInstance(overview, inst);
    overviewBranches.add(inst.scheduledVisitId);
    if (day) overviewDays.add(day);

    if (!companyMap.has(company)) {
      companyMap.set(company, {
        companyName: company,
        totals: newCounters(),
        perVisitType: {},
        branchSet: new Set(),
        daySet: new Set(),
      });
    }
    const bucket = companyMap.get(company);
    tallyInstance(bucket.totals, inst);
    bucket.branchSet.add(inst.scheduledVisitId);
    if (day) bucket.daySet.add(day);

    const vt = `V${inst.visitOrder}`;
    if (!bucket.perVisitType[vt]) {
      bucket.perVisitType[vt] = { ...newCounters(), startDate: null, endDate: null };
    }
    const vtCounters = bucket.perVisitType[vt];
    tallyInstance(vtCounters, inst);
    if (inst.scheduledDate) {
      if (!vtCounters.startDate || inst.scheduledDate < vtCounters.startDate) {
        vtCounters.startDate = inst.scheduledDate;
      }
      if (!vtCounters.endDate || inst.scheduledDate > vtCounters.endDate) {
        vtCounters.endDate = inst.scheduledDate;
      }
    }
  }

  const companies = [...companyMap.values()]
    .map((b) => ({
      companyName: b.companyName,
      branches: b.branchSet.size,
      daysWorked: b.daySet.size,
      totals: b.totals,
      perVisitType: b.perVisitType,
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  return {
    year,
    month,
    overview: {
      branches: overviewBranches.size,
      daysWorked: overviewDays.size,
      ...overview,
    },
    companies,
  };
};

/**
 * GET /supervisor/stats — the same Monthly Time Distribution data, flattened
 * into the shape the mobile "Performance" screen consumes directly:
 *   { branchesCount, visitsTotal, implemented, notVisited, closed,
 *     notImplemented, documented, undocumented, daysWorked,
 *     byCompany: [ { companyName, v1, v2, v3, v4, total } ] }
 *
 * Metric definitions (all scoped to THIS supervisor, for the given month):
 *   branchesCount  — distinct branches (ScheduledVisit rows) in the schedule
 *   visitsTotal    — total VisitInstance rows (sum of all V1..Vn)
 *   implemented    — status = IMPLEMENTED
 *   notVisited     — status = REMAINING (no action taken yet)
 *   closed         — status = FINAL_CLOSED
 *   notImplemented — status = NOT_IMPLEMENTED
 *   documented     — documentationStatus = DOCUMENTED
 *   undocumented   — documentationStatus = UNDOCUMENTED
 *   daysWorked     — distinct UTC calendar days a visit was STARTED
 *   byCompany[].vN — count of that company's visit instances of order N
 *   byCompany[].total — that company's total visit instances
 *   byCompany[].versions — per-version status breakdown (Hourglass screen):
 *     [{ version, done, pending, closed, notDone, documented, undocumented, total }]
 */
const getMyStats = async (supervisorId, rawQuery = {}) => {
  const data = await getMyPerformance(supervisorId, rawQuery);
  const o = data.overview;
  return {
    year: data.year,
    month: data.month,
    branchesCount: o.branches,
    visitsTotal: o.totalVisits,
    implemented: o.implemented,
    notVisited: o.notVisited,
    closed: o.finalClosed,
    notImplemented: o.notImplemented,
    documented: o.documented,
    undocumented: o.undocumented,
    daysWorked: o.daysWorked,
    byCompany: data.companies.map((c) => ({
      companyName: c.companyName,
      // Plain per-version counts, kept for backward compatibility.
      v1: c.perVisitType.V1?.totalVisits || 0,
      v2: c.perVisitType.V2?.totalVisits || 0,
      v3: c.perVisitType.V3?.totalVisits || 0,
      v4: c.perVisitType.V4?.totalVisits || 0,
      total: c.totals.totalVisits,
      // Per-version status breakdown for the "Hourglass" screen (V1..V4
      // tabs). The "All" tab = top-level overview / sum of these versions.
      versions: versionBreakdown(c.perVisitType),
    })),
  };
};

/**
 * Flatten the performance breakdown into one row per (company × visit type)
 * for the Excel/PDF export (FRD §1.3.3). Returns the full performance object
 * plus a `flatRows` array shaped for the export columns.
 */
const buildPerformanceFlatRows = async (supervisorId, rawQuery = {}) => {
  const data = await getMyPerformance(supervisorId, rawQuery);
  const flatRows = [];
  for (const company of data.companies) {
    for (const vt of Object.keys(company.perVisitType).sort()) {
      const m = company.perVisitType[vt];
      flatRows.push({
        companyName: company.companyName,
        visitType: vt,
        totalVisits: m.totalVisits,
        implemented: m.implemented,
        notVisited: m.notVisited,
        finalClosed: m.finalClosed,
        notImplemented: m.notImplemented,
        documented: m.documented,
        undocumented: m.undocumented,
        startDate: dayStamp(m.startDate) || '',
        endDate: dayStamp(m.endDate) || '',
      });
    }
  }
  return { ...data, flatRows };
};

module.exports = {
  myScheduleSummary,
  listMyBranches,
  getMyBranchDetail,
  getMyPerformance,
  getMyStats,
  buildPerformanceFlatRows,
  monthBoundsUTC,
};

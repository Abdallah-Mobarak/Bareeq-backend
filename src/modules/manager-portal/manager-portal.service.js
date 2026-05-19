const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Manager-facing read API — FRD §3 (Web Application Functionality for
 * Managers). Managers have a broad scope: they see every supervisor /
 * branch in the platform. Per-module access is gated by the dynamic
 * PermissionRole system at the admin level, not by per-row scoping.
 *
 * This service is **read-only**. The data here is aggregated on the
 * fly from existing tables (VisitInstance / ScheduledVisit / etc.) —
 * no schema additions, no caching. If volume grows past ~50k visit
 * instances per month we'll add a materialized view.
 */

/**
 * GET /manager/my-profile — FRD §3.1.
 * Returns the manager's basic identity (no permissions detail — that's
 * a separate /admin endpoint).
 */
const getMyProfile = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw ApiError.unauthorized('User not found');

  return {
    id: user.id,
    role: user.role,
    name: user.nameAr,
    nameEn: user.nameEn,
    email: user.email,
    phone: user.phone,
  };
};

/**
 * Default the year/month to the current UTC month if either is missing.
 * The FRD §3.2 doesn't pin a date range, but "follow-up teams" implies
 * ongoing/current. Defaulting to "this month" keeps query cost bounded
 * and matches how the Company Portal handles the same gap.
 */
const resolveMonth = ({ year, month }) => {
  const now = new Date();
  return {
    y: year ?? now.getUTCFullYear(),
    m: month ?? now.getUTCMonth() + 1,
  };
};

const isImplemented = (s) => s === 'IMPLEMENTED';
const isNotImplemented = (s) => s === 'NOT_IMPLEMENTED';
const isFinalClosed = (s) => s === 'FINAL_CLOSED';
const isDocumented = (d) => d === 'DOCUMENTED';

/**
 * Empty counter shape — keeps every team row's totals consistent in
 * the response, even before we touch a single instance.
 */
const emptyCounters = () => ({
  totalBranches: 0, // distinct regionScheduling ids
  totalVisits: 0,
  implemented: 0,
  remaining: 0,
  notImplemented: 0,
  finalClosed: 0,
  documented: 0,
  undocumented: 0,
});

/**
 * GET /manager/teams — FRD §3.2.1 + §3.2.2 + §3.2.3.
 *
 * One row per (supervisor × companyName). All counters reflect the
 * given month. Filters/search match against the FRD list: company name,
 * supervisor name, city, region.
 *
 * Implementation note: we fetch the raw VisitInstance rows once and
 * aggregate in JS. A single GROUP BY with N counter columns is also
 * an option, but the JS aggregation is simpler, lets us compute the
 * "distinct branches per group" cleanly, and matches the pattern used
 * by company-portal's monthly report.
 */
const listTeams = async (rawQuery) => {
  const { y, m } = resolveMonth(rawQuery);
  const { companyName, supervisorName, city, region } = rawQuery;

  /**
   * Pull every VisitInstance for the month, plus enough context to
   * group by (supervisor, company) and surface filter fields. We use
   * `select` aggressively to keep the payload small — no nested
   * relations beyond what the response actually needs.
   */
  const where = {
    deletedAt: null,
    scheduledVisit: {
      deletedAt: null,
      monthlySchedule: {
        deletedAt: null,
        year: y,
        month: m,
        supervisor: {
          deletedAt: null,
          role: 'SUPERVISOR',
          ...(supervisorName && {
            OR: [
              { nameAr: { contains: supervisorName, mode: 'insensitive' } },
              { nameEn: { contains: supervisorName, mode: 'insensitive' } },
            ],
          }),
        },
      },
      regionScheduling: {
        deletedAt: null,
        ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
        ...(region && { region: { contains: region, mode: 'insensitive' } }),
      },
    },
  };

  const instances = await prisma.visitInstance.findMany({
    where,
    select: {
      status: true,
      documentationStatus: true,
      scheduledVisit: {
        select: {
          regionSchedulingId: true,
          regionScheduling: {
            select: {
              companyName: true,
              city: true,
              region: true,
            },
          },
          monthlySchedule: {
            select: {
              supervisor: {
                select: { id: true, nameAr: true, nameEn: true, email: true, phone: true },
              },
            },
          },
        },
      },
    },
  });

  /**
   * Accumulator: keyed by `${supervisorId}::${companyName}` so two
   * supervisors visiting the same company produce two rows, and one
   * supervisor visiting two companies also produces two rows.
   */
  const teams = new Map();
  const ensureTeam = (supervisor, companyName) => {
    const key = `${supervisor.id}::${companyName}`;
    if (teams.has(key)) return teams.get(key);
    const row = {
      key,
      supervisor: {
        id: supervisor.id,
        nameAr: supervisor.nameAr,
        nameEn: supervisor.nameEn,
        email: supervisor.email,
        phone: supervisor.phone,
      },
      companyName,
      cities: new Set(),
      regions: new Set(),
      branchIds: new Set(),
      counters: emptyCounters(),
    };
    teams.set(key, row);
    return row;
  };

  for (const inst of instances) {
    const sv = inst.scheduledVisit;
    if (!sv) continue;
    const supervisor = sv.monthlySchedule?.supervisor;
    const rs = sv.regionScheduling;
    if (!supervisor || !rs) continue;

    const row = ensureTeam(supervisor, rs.companyName);

    if (rs.city) row.cities.add(rs.city);
    if (rs.region) row.regions.add(rs.region);
    row.branchIds.add(sv.regionSchedulingId);

    const c = row.counters;
    c.totalVisits += 1;
    if (isImplemented(inst.status)) c.implemented += 1;
    else c.remaining += 1; // anything not-implemented counts as remaining
    if (isNotImplemented(inst.status)) c.notImplemented += 1;
    if (isFinalClosed(inst.status)) c.finalClosed += 1;
    if (isDocumented(inst.documentationStatus)) c.documented += 1;
    else c.undocumented += 1;
  }

  /**
   * Finalise rows: replace the Sets with arrays/lengths the frontend
   * can consume directly, and drop the temporary `key`. Each row gets
   * a stable opaque `id` (base64 of supervisorId + companyName) so the
   * export endpoint can target specific rows via ?ids=.
   */
  const rows = Array.from(teams.values()).map((row) => ({
    id: Buffer.from(row.key).toString('base64url'),
    supervisor: row.supervisor,
    companyName: row.companyName,
    cities: Array.from(row.cities).sort(),
    regions: Array.from(row.regions).sort(),
    totalBranches: row.branchIds.size,
    totalVisits: row.counters.totalVisits,
    implemented: row.counters.implemented,
    remaining: row.counters.remaining,
    notImplemented: row.counters.notImplemented,
    finalClosed: row.counters.finalClosed,
    documented: row.counters.documented,
    undocumented: row.counters.undocumented,
  }));

  // Deterministic ordering: by supervisor name, then company name.
  rows.sort((a, b) => {
    const sn = (a.supervisor.nameAr || '').localeCompare(b.supervisor.nameAr || '');
    return sn !== 0 ? sn : a.companyName.localeCompare(b.companyName);
  });

  return {
    year: y,
    month: m,
    rowCount: rows.length,
    rows,
  };
};

/**
 * GET /manager/teams/export.{xlsx,pdf} — FRD §3.2.4.
 *
 * Same shape as listTeams, with an optional `ids` filter applied on top.
 * `ids` lets the frontend export "this specific row", "these N rows",
 * or omit ids entirely to export the full filtered list.
 */
const listTeamsForExport = async (rawQuery) => {
  const { ids, ...filters } = rawQuery;
  const { year, month, rows } = await listTeams(filters);
  const filtered =
    ids && ids.length > 0 ? rows.filter((r) => ids.includes(r.id)) : rows;
  return { year, month, rowCount: filtered.length, rows: filtered };
};

/**
 * ============================================
 * Implemented Branches Management — FRD §3.5
 * ============================================
 * Manager-facing branch listing across the whole platform. Unlike the
 * Company Portal's equivalent, there's no per-row scoping: managers
 * see every branch. The shape is intentionally identical to the
 * Company Portal's branches list so a shared frontend table component
 * can render either endpoint without branching logic.
 */

const visitTypesFor = (n) => Array.from({ length: n }, (_, i) => `V${i + 1}`);

const serializeBranchRow = (sv) => ({
  id: sv.id,
  monthlyScheduleId: sv.monthlyScheduleId,
  year: sv.monthlySchedule?.year,
  month: sv.monthlySchedule?.month,
  supervisor: sv.monthlySchedule?.supervisor
    ? {
        id: sv.monthlySchedule.supervisor.id,
        nameAr: sv.monthlySchedule.supervisor.nameAr,
        nameEn: sv.monthlySchedule.supervisor.nameEn,
      }
    : null,
  regionScheduling: sv.regionScheduling
    ? {
        id: sv.regionScheduling.id,
        companyName: sv.regionScheduling.companyName,
        branchName: sv.regionScheduling.branchName,
        categoryName: sv.regionScheduling.categoryName,
        brandName: [sv.regionScheduling.branchName, sv.regionScheduling.categoryName]
          .filter(Boolean)
          .join(' — '),
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
  instances: (sv.visitInstances || []).map((i) => ({
    id: i.id,
    visitOrder: i.visitOrder,
    scheduledDate: i.scheduledDate,
    status: i.status,
    documentationStatus: i.documentationStatus,
  })),
});

/**
 * Compose the Prisma `where` for /manager/branches. No role-scope here —
 * managers see everything. Filters compose AND-wise.
 *
 * FRD §3.5.3 (search) + §3.5.4 (filter): the two FRD sections list
 * overlapping fields, so we expose each as its own query param and let
 * the frontend wire them however the UI needs.
 */
const buildBranchesWhere = (query) => {
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
    dateFrom,
    dateTo,
    year,
    month,
    ids,
  } = query;

  const where = {
    deletedAt: null,
    ...(ids && ids.length > 0 && { id: { in: ids } }),
    monthlySchedule: {
      deletedAt: null,
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
 * GET /manager/branches — paginated list. Defaults to the current
 * month so the dashboard's first request is always fast.
 */
const listBranches = async (rawQuery) => {
  const now = new Date();
  const query = {
    ...rawQuery,
    year: rawQuery.year ?? now.getUTCFullYear(),
    month: rawQuery.month ?? now.getUTCMonth() + 1,
  };

  const where = buildBranchesWhere(query);
  const { page, limit, sort } = query;

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'newest') orderBy = { createdAt: 'desc' };
  else orderBy = { firstVisitDate: 'asc' };

  const [items, total] = await prisma.$transaction([
    prisma.scheduledVisit.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        monthlySchedule: {
          select: {
            year: true,
            month: true,
            supervisor: { select: { id: true, nameAr: true, nameEn: true } },
          },
        },
        regionScheduling: true,
        visitInstances: {
          where: { deletedAt: null },
          orderBy: { visitOrder: 'asc' },
        },
      },
    }),
    prisma.scheduledVisit.count({ where }),
  ]);

  return {
    items: items.map(serializeBranchRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /manager/branches/:id — full detail (FRD §3.5.6 references §2.2.5).
 * Returns the same fields the Company Portal returns for its branch
 * detail, PLUS the supervisor info (which the company doesn't see).
 */
const getBranchDetail = async (scheduledVisitId) => {
  const sv = await prisma.scheduledVisit.findFirst({
    where: { id: scheduledVisitId, deletedAt: null },
    include: {
      monthlySchedule: {
        select: {
          year: true,
          month: true,
          supervisor: {
            select: { id: true, nameAr: true, nameEn: true, email: true, phone: true },
          },
        },
      },
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

  if (!sv) throw ApiError.notFound('Branch not found');

  return {
    id: sv.id,
    monthlyScheduleId: sv.monthlyScheduleId,
    year: sv.monthlySchedule?.year,
    month: sv.monthlySchedule?.month,
    supervisor: sv.monthlySchedule?.supervisor || null,
    regionScheduling: {
      id: sv.regionScheduling.id,
      companyName: sv.regionScheduling.companyName,
      branchName: sv.regionScheduling.branchName,
      categoryName: sv.regionScheduling.categoryName,
      brandName: [sv.regionScheduling.branchName, sv.regionScheduling.categoryName]
        .filter(Boolean)
        .join(' — '),
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
 * Flat-row shape for the Excel / PDF exporters. One row per branch
 * with a single "statuses" cell summarising the per-V status.
 */
const instancesStatusSummary = (instances) =>
  (instances || [])
    .slice()
    .sort((a, b) => a.visitOrder - b.visitOrder)
    .map((i) => `V${i.visitOrder}: ${i.status}`)
    .join(', ');

const EXPORT_HARD_LIMIT = 5000;

const listBranchesForExport = async (rawQuery) => {
  const now = new Date();
  const query = {
    ...rawQuery,
    year: rawQuery.year ?? now.getUTCFullYear(),
    month: rawQuery.month ?? now.getUTCMonth() + 1,
  };

  const where = buildBranchesWhere(query);

  const items = await prisma.scheduledVisit.findMany({
    where,
    orderBy: { firstVisitDate: 'asc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      monthlySchedule: {
        select: { supervisor: { select: { nameAr: true, nameEn: true } } },
      },
      regionScheduling: true,
      visitInstances: {
        where: { deletedAt: null },
        orderBy: { visitOrder: 'asc' },
        select: { visitOrder: true, status: true },
      },
    },
  });

  return items.map((sv) => ({
    companyName: sv.regionScheduling?.companyName,
    brandName: [sv.regionScheduling?.branchName, sv.regionScheduling?.categoryName]
      .filter(Boolean)
      .join(' — '),
    branchNumber: sv.regionScheduling?.branchNumber,
    supervisor: sv.monthlySchedule?.supervisor
      ? `${sv.monthlySchedule.supervisor.nameAr}${sv.monthlySchedule.supervisor.nameEn ? ` (${sv.monthlySchedule.supervisor.nameEn})` : ''}`
      : null,
    visitDate: sv.firstVisitDate
      ? new Date(sv.firstVisitDate).toISOString().slice(0, 10)
      : null,
    city: sv.regionScheduling?.city,
    region: sv.regionScheduling?.region,
    address: sv.regionScheduling?.address,
    location: sv.regionScheduling?.location,
    numberOfVisits: sv.regionScheduling?.numberOfVisits,
    code: sv.regionScheduling?.code,
    visitTypes: visitTypesFor(sv.regionScheduling?.numberOfVisits || 0).join(', '),
    statuses: instancesStatusSummary(sv.visitInstances),
  }));
};

/**
 * ============================================
 * Monthly Reports for Companies — FRD §3.6
 * ============================================
 * Per-company breakdown of the month's visits. Adds two counters
 * (documented / undocumented) and a `companyName` grouping on top of
 * what the Company Portal exposes in §2.3.
 *
 *   Result shape:
 *   {
 *     year, month, companyCount, totalBranches,
 *     companies: [
 *       { companyName, branchCount, rows: [...per-branch], totals: {...} }
 *     ],
 *     totals: { branchCount, perVisitType, all }   // grand totals
 *   }
 */

const emptyVCounters = () => ({
  total: 0,
  implemented: 0,
  remaining: 0,
  documented: 0,
  undocumented: 0,
});

const tallyInstance = (bucket, inst) => {
  bucket.total += 1;
  if (inst.status === 'IMPLEMENTED') bucket.implemented += 1;
  else bucket.remaining += 1;
  if (inst.documentationStatus === 'DOCUMENTED') bucket.documented += 1;
  else bucket.undocumented += 1;
};

const getMonthlyReportByCompany = async ({ year, month, companyName }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  /**
   * Pull every VisitInstance for the month with enough context to
   * group by (companyName → branch). The `select` projection keeps
   * the payload tight (no relations we won't aggregate).
   */
  const instances = await prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { deletedAt: null, year: y, month: m },
        regionScheduling: {
          deletedAt: null,
          ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
        },
      },
    },
    select: {
      visitOrder: true,
      status: true,
      documentationStatus: true,
      scheduledVisit: {
        select: {
          regionScheduling: {
            select: {
              id: true,
              branchName: true,
              categoryName: true,
              city: true,
              companyName: true,
              numberOfVisits: true,
            },
          },
        },
      },
    },
  });

  /**
   * Two-level grouping: companies → branches.
   *   companies[companyName] = {
   *     branches: Map<regionSchedulingId, branchRow>,
   *     totals: { perVisitType, all },
   *   }
   * We use Map to keep iteration order predictable.
   */
  const companies = new Map();
  const ensureCompany = (cName) => {
    if (companies.has(cName)) return companies.get(cName);
    const c = {
      companyName: cName,
      branches: new Map(),
      totals: { perVisitType: {}, all: emptyVCounters() },
    };
    companies.set(cName, c);
    return c;
  };

  const ensureBranch = (company, rs) => {
    if (company.branches.has(rs.id)) return company.branches.get(rs.id);
    const row = {
      regionSchedulingId: rs.id,
      branchName: rs.branchName,
      categoryName: rs.categoryName,
      brandName: [rs.branchName, rs.categoryName].filter(Boolean).join(' — '),
      city: rs.city,
      numberOfVisits: rs.numberOfVisits,
      perVisitType: {},
      totals: emptyVCounters(),
    };
    // Pre-seed per-V buckets so empty Vs still appear (predictable shape).
    for (let i = 1; i <= rs.numberOfVisits; i++) {
      row.perVisitType[`V${i}`] = emptyVCounters();
    }
    company.branches.set(rs.id, row);
    return row;
  };

  // Grand totals across all companies.
  const grand = { perVisitType: {}, all: emptyVCounters() };

  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    if (!rs) continue;

    const company = ensureCompany(rs.companyName);
    const branch = ensureBranch(company, rs);
    const vKey = `V${inst.visitOrder}`;

    // Branch-level bucket.
    if (!branch.perVisitType[vKey]) branch.perVisitType[vKey] = emptyVCounters();
    tallyInstance(branch.perVisitType[vKey], inst);
    tallyInstance(branch.totals, inst);

    // Company-level bucket.
    if (!company.totals.perVisitType[vKey]) {
      company.totals.perVisitType[vKey] = emptyVCounters();
    }
    tallyInstance(company.totals.perVisitType[vKey], inst);
    tallyInstance(company.totals.all, inst);

    // Grand totals.
    if (!grand.perVisitType[vKey]) grand.perVisitType[vKey] = emptyVCounters();
    tallyInstance(grand.perVisitType[vKey], inst);
    tallyInstance(grand.all, inst);
  }

  // Materialise companies → sorted by name, with branches sorted by brand.
  const companiesArr = Array.from(companies.values())
    .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''))
    .map((c) => {
      const branches = Array.from(c.branches.values()).sort((a, b) =>
        (a.brandName || '').localeCompare(b.brandName || ''),
      );
      return {
        companyName: c.companyName,
        branchCount: branches.length,
        rows: branches,
        totals: { branchCount: branches.length, ...c.totals },
      };
    });

  const totalBranches = companiesArr.reduce((s, c) => s + c.branchCount, 0);

  return {
    year: y,
    month: m,
    companyCount: companiesArr.length,
    totalBranches,
    companies: companiesArr,
    totals: { branchCount: totalBranches, ...grand },
  };
};

/**
 * Flatten the company report into one row per (company × brand × V)
 * for the Excel / PDF exporters. The grand totals are NOT included in
 * the rows themselves — exporters print them in the title / subtitle
 * band so they don't get sorted away.
 */
const buildMonthlyReportByCompanyFlatRows = async (query) => {
  const report = await getMonthlyReportByCompany(query);
  const rows = [];
  for (const c of report.companies) {
    for (const row of c.rows) {
      for (const [vKey, counts] of Object.entries(row.perVisitType)) {
        rows.push({
          companyName: c.companyName,
          brandName: row.brandName,
          city: row.city,
          visitType: vKey,
          total: counts.total,
          implemented: counts.implemented,
          remaining: counts.remaining,
          documented: counts.documented,
          undocumented: counts.undocumented,
        });
      }
    }
  }
  return { ...report, flatRows: rows };
};

/**
 * ============================================
 * Customer Tracking Management — FRD §3.4
 * ============================================
 * One row per company with all status buckets the FRD asks for. The
 * counters here are **mutually exclusive** (implemented + remaining +
 * notImplemented + finalClosed = total) so a stacked-bar chart in the
 * UI doesn't double-count. Documentation counts are on a separate axis
 * (documented + undocumented = total).
 *
 * UNDERWAY visits roll into `remaining` because the FRD §3.4 column
 * list only has 4 status buckets; treating UNDERWAY as "remaining" is
 * the closest match (it's a visit that's still not done).
 */

const emptyCustomerCounters = () => ({
  branchCount: 0,
  total: 0,
  implemented: 0,
  remaining: 0,
  notImplemented: 0,
  finalClosed: 0,
  documented: 0,
  undocumented: 0,
});

const tallyCustomerInstance = (c, inst) => {
  c.total += 1;
  switch (inst.status) {
    case 'IMPLEMENTED':
      c.implemented += 1;
      break;
    case 'NOT_IMPLEMENTED':
      c.notImplemented += 1;
      break;
    case 'FINAL_CLOSED':
      c.finalClosed += 1;
      break;
    case 'REMAINING':
    case 'UNDERWAY':
    default:
      c.remaining += 1;
      break;
  }
  if (inst.documentationStatus === 'DOCUMENTED') c.documented += 1;
  else c.undocumented += 1;
};

const listCustomers = async ({ year, month, companyName }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  const instances = await prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { deletedAt: null, year: y, month: m },
        regionScheduling: {
          deletedAt: null,
          ...(companyName && { companyName: { contains: companyName, mode: 'insensitive' } }),
        },
      },
    },
    select: {
      status: true,
      documentationStatus: true,
      scheduledVisit: {
        select: {
          regionSchedulingId: true,
          regionScheduling: { select: { companyName: true } },
        },
      },
    },
  });

  /**
   * Keyed by companyName. Each customer accumulates counters plus a Set
   * of branch IDs (so we don't double-count branches that have multiple
   * visit instances).
   */
  const customers = new Map();
  const ensureCustomer = (cName) => {
    if (customers.has(cName)) return customers.get(cName);
    const row = {
      companyName: cName,
      branchIds: new Set(),
      counters: emptyCustomerCounters(),
    };
    customers.set(cName, row);
    return row;
  };

  const grand = emptyCustomerCounters();
  const grandBranchIds = new Set();

  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    if (!rs) continue;

    const cust = ensureCustomer(rs.companyName);
    cust.branchIds.add(inst.scheduledVisit.regionSchedulingId);
    grandBranchIds.add(inst.scheduledVisit.regionSchedulingId);

    tallyCustomerInstance(cust.counters, inst);
    tallyCustomerInstance(grand, inst);
  }

  // Finalise: replace branchIds Set with the count + sort by name.
  const rows = Array.from(customers.values())
    .map((c) => ({
      companyName: c.companyName,
      branchCount: c.branchIds.size,
      totalVisits: c.counters.total,
      implemented: c.counters.implemented,
      remaining: c.counters.remaining,
      notImplemented: c.counters.notImplemented,
      finalClosed: c.counters.finalClosed,
      documented: c.counters.documented,
      undocumented: c.counters.undocumented,
    }))
    .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));

  return {
    year: y,
    month: m,
    rowCount: rows.length,
    rows,
    totals: {
      customerCount: rows.length,
      branchCount: grandBranchIds.size,
      totalVisits: grand.total,
      implemented: grand.implemented,
      remaining: grand.remaining,
      notImplemented: grand.notImplemented,
      finalClosed: grand.finalClosed,
      documented: grand.documented,
      undocumented: grand.undocumented,
    },
  };
};

/**
 * ============================================
 * Follow-Up & Manage Daily Visits — FRD §3.3
 * ============================================
 * One row per supervisor over a date range (default: this month so
 * the dashboard's first paint is cheap). Each row carries the FRD's
 * three counters (total / implemented / remaining) PLUS computed work
 * dates (startWorkDate = first time they clicked Start, endWorkDate =
 * last time they clicked Complete, daysWorked = distinct work days).
 *
 * The date range filter matches `scheduledDate` — i.e. "what was
 * scheduled in this window?". This makes supervisors with zero
 * activity still visible (so the manager can chase them), instead of
 * silently dropping them when they have nothing to filter on.
 */

const firstOfCurrentMonthUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const endOfTodayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
};

const ymdUTC = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const listDailyVisits = async ({ supervisorName, startDate, endDate, ids }) => {
  const sd = startDate ? new Date(startDate) : firstOfCurrentMonthUTC();
  const ed = endDate ? new Date(endDate) : endOfTodayUTC();

  const instances = await prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledDate: { gte: sd, lte: ed },
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: {
          deletedAt: null,
          supervisor: {
            deletedAt: null,
            role: 'SUPERVISOR',
            ...(ids && ids.length > 0 && { id: { in: ids } }),
            ...(supervisorName && {
              OR: [
                { nameAr: { contains: supervisorName, mode: 'insensitive' } },
                { nameEn: { contains: supervisorName, mode: 'insensitive' } },
              ],
            }),
          },
        },
      },
    },
    select: {
      status: true,
      scheduledDate: true,
      startedAt: true,
      endedAt: true,
      scheduledVisit: {
        select: {
          monthlySchedule: {
            select: {
              supervisor: {
                select: { id: true, nameAr: true, nameEn: true, email: true, phone: true },
              },
            },
          },
        },
      },
    },
  });

  /**
   * Keyed by supervisor.id. workDates is a Set of YYYY-MM-DD strings
   * — distinct calendar days the supervisor actually started a visit.
   * We use the Date's UTC components (toISOString.slice(0,10)) to keep
   * the dataset timezone-stable; a visit started at 23:00 in Riyadh
   * counts as the UTC day, which matches how everything else in the
   * codebase serialises dates.
   */
  const supervisors = new Map();
  const ensureRow = (sup) => {
    if (supervisors.has(sup.id)) return supervisors.get(sup.id);
    const row = {
      supervisor: sup,
      totalVisits: 0,
      implemented: 0,
      remaining: 0,
      workDates: new Set(),
      minStartedAt: null,
      maxEndedAt: null,
    };
    supervisors.set(sup.id, row);
    return row;
  };

  for (const inst of instances) {
    const sup = inst.scheduledVisit?.monthlySchedule?.supervisor;
    if (!sup) continue;

    const row = ensureRow(sup);
    row.totalVisits += 1;
    if (inst.status === 'IMPLEMENTED') row.implemented += 1;
    else row.remaining += 1; // broad interpretation per §3.3.1 (only 3 counters listed)

    if (inst.startedAt) {
      row.workDates.add(ymdUTC(inst.startedAt));
      if (!row.minStartedAt || inst.startedAt < row.minStartedAt) row.minStartedAt = inst.startedAt;
    }
    if (inst.endedAt) {
      if (!row.maxEndedAt || inst.endedAt > row.maxEndedAt) row.maxEndedAt = inst.endedAt;
    }
  }

  const rows = Array.from(supervisors.values())
    .map((r) => ({
      supervisor: r.supervisor,
      totalVisits: r.totalVisits,
      implemented: r.implemented,
      remaining: r.remaining,
      startWorkDate: ymdUTC(r.minStartedAt),
      endWorkDate: ymdUTC(r.maxEndedAt),
      daysWorked: r.workDates.size,
    }))
    .sort((a, b) => (a.supervisor.nameAr || '').localeCompare(b.supervisor.nameAr || ''));

  return {
    startDate: ymdUTC(sd),
    endDate: ymdUTC(ed),
    rowCount: rows.length,
    rows,
  };
};

/**
 * ============================================
 * Overall Monthly Reports — FRD §3.12
 * ============================================
 * Three views on the same underlying data:
 *   • Overall Summary  (§3.12.1) — single-snapshot of the month
 *   • Regional Reports (§3.12.2) — per-region snapshot of the month
 *   • Monthly Analysis (§3.12.3) — month-by-month series for the year
 *
 * Vocabulary across all three (matches the FRD verbatim):
 *   scheduled     → all visit instances in scope
 *   implemented   → status = IMPLEMENTED
 *   unimplemented → scheduled − implemented
 *   completionRate → round((implemented / scheduled) × 100), 0 if scheduled=0
 */

const rate = (implemented, scheduled) =>
  scheduled === 0 ? 0 : Math.round((implemented / scheduled) * 100);

/**
 * Pull `(region, regionSchedulingId, status)` triples for a given
 * month so we can compute scheduled / implemented / branchCount and
 * group by region. Returns raw rows; the callers do their own
 * aggregation shape.
 */
const fetchMonthInstances = async (year, month, regionFilter) => {
  return prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { deletedAt: null, year, month },
        regionScheduling: {
          deletedAt: null,
          ...(regionFilter && { region: { contains: regionFilter, mode: 'insensitive' } }),
        },
      },
    },
    /**
     * Selection covers all three callers — summary, regional, and the
     * observation-builder. `documentationStatus` + `notImplementedReason`
     * are only consumed by `computeObservations`; the per-row cost is
     * cheap enough that one shared query is preferable to forking.
     */
    select: {
      status: true,
      documentationStatus: true,
      notImplementedReason: { select: { titleAr: true, titleEn: true } },
      scheduledVisit: {
        select: {
          regionSchedulingId: true,
          regionScheduling: { select: { region: true } },
        },
      },
    },
  });
};

/**
 * Derive the "most prominent observations or alerts" block from the
 * raw month instances — FRD §3.12.1 / §4.13.1.
 *
 * The FRD doesn't define what counts as an observation, so we pick
 * five auto-generated signals from the data already in scope:
 *   1. Top 3 NOT_IMPLEMENTED reasons (warning) — what's blocking visits?
 *   2. Branches with FINAL_CLOSED visits (critical) — permanent losses.
 *   3. Untouched branches (warning) — no action at all yet this month.
 *   4. IMPLEMENTED but UNDOCUMENTED visits (warning) — documentation lag.
 *   5. Regions with < 50% completion (critical) — under-performing areas.
 *
 * Each observation carries a stable `code` + bilingual messages + a
 * `count` so the frontend can choose to render either the message or
 * a custom layout. `severity` is `'warning'` or `'critical'`.
 *
 * Returns at most 10 observations (top reasons capped at 3, plus the
 * other four buckets) so the dashboard stays readable.
 */
const computeObservations = (instances) => {
  const observations = [];

  // ── 1. Top 3 Not-Implemented reasons ───────────────────────────────
  const reasonCounts = new Map();
  for (const inst of instances) {
    if (inst.status !== 'NOT_IMPLEMENTED' || !inst.notImplementedReason) continue;
    const key = inst.notImplementedReason.titleAr;
    const entry = reasonCounts.get(key) || {
      titleAr: inst.notImplementedReason.titleAr,
      titleEn: inst.notImplementedReason.titleEn,
      count: 0,
    };
    entry.count += 1;
    reasonCounts.set(key, entry);
  }
  const topReasons = [...reasonCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  for (const r of topReasons) {
    observations.push({
      code: 'TOP_NOT_IMPL_REASON',
      severity: 'warning',
      count: r.count,
      messageAr: `${r.count} زيارة لم تنفذ — السبب: ${r.titleAr}`,
      messageEn: r.titleEn
        ? `${r.count} visits not implemented — reason: ${r.titleEn}`
        : `${r.count} visits not implemented — reason: ${r.titleAr}`,
    });
  }

  // ── 2. Final-Closed branches ───────────────────────────────────────
  const finalClosed = instances.filter((i) => i.status === 'FINAL_CLOSED').length;
  if (finalClosed > 0) {
    observations.push({
      code: 'FINAL_CLOSED_VISITS',
      severity: 'critical',
      count: finalClosed,
      messageAr: `${finalClosed} زيارة تم إغلاقها نهائياً هذا الشهر`,
      messageEn: `${finalClosed} visits marked Final Closed this month`,
    });
  }

  // ── 3. Branches with NO action yet ─────────────────────────────────
  // "No action" = every one of the branch's visits is still REMAINING.
  const branchHasAction = new Map();
  for (const inst of instances) {
    const bid = inst.scheduledVisit.regionSchedulingId;
    if (inst.status !== 'REMAINING') {
      branchHasAction.set(bid, true);
    } else if (!branchHasAction.has(bid)) {
      branchHasAction.set(bid, false);
    }
  }
  const untouched = [...branchHasAction.values()].filter((v) => v === false).length;
  if (untouched > 0) {
    observations.push({
      code: 'UNTOUCHED_BRANCHES',
      severity: 'warning',
      count: untouched,
      messageAr: `${untouched} فرع لم يبدأ المشرف العمل عليه بعد`,
      messageEn: `${untouched} branches have no action taken yet`,
    });
  }

  // ── 4. Implemented but Undocumented ────────────────────────────────
  const undoc = instances.filter(
    (i) => i.status === 'IMPLEMENTED' && i.documentationStatus === 'UNDOCUMENTED',
  ).length;
  if (undoc > 0) {
    observations.push({
      code: 'IMPLEMENTED_UNDOCUMENTED',
      severity: 'warning',
      count: undoc,
      messageAr: `${undoc} زيارة منفذة بدون توثيق من مدير الفرع`,
      messageEn: `${undoc} implemented visits are still undocumented`,
    });
  }

  // ── 5. Regions with < 50% completion (min sample = 5 visits) ───────
  const regionStats = new Map();
  for (const inst of instances) {
    const r = inst.scheduledVisit.regionScheduling?.region;
    if (!r) continue;
    const s = regionStats.get(r) || { scheduled: 0, implemented: 0 };
    s.scheduled += 1;
    if (inst.status === 'IMPLEMENTED') s.implemented += 1;
    regionStats.set(r, s);
  }
  for (const [region, s] of regionStats) {
    // Guard: tiny samples (< 5 visits) produce noisy %'s — skip them.
    if (s.scheduled < 5) continue;
    const rt = rate(s.implemented, s.scheduled);
    if (rt < 50) {
      observations.push({
        code: 'LOW_COMPLETION_REGION',
        severity: 'critical',
        count: rt,
        messageAr: `منطقة ${region} نسبة الإنجاز ${rt}% — أقل من المستهدف`,
        messageEn: `Region ${region} completion is ${rt}% — below target`,
        data: { region, completionRate: rt, scheduled: s.scheduled },
      });
    }
  }

  return observations;
};

/**
 * GET /manager/reports/summary — FRD §3.12.1
 * Single number-pad view of the month.
 */
const getOverallSummary = async ({ year, month }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  const instances = await fetchMonthInstances(y, m);

  const regions = new Set();
  const branches = new Set();
  let implemented = 0;

  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    if (rs?.region) regions.add(rs.region);
    branches.add(inst.scheduledVisit.regionSchedulingId);
    if (inst.status === 'IMPLEMENTED') implemented += 1;
  }

  const scheduled = instances.length;
  return {
    year: y,
    month: m,
    regionCount: regions.size,
    branchCount: branches.size,
    scheduled,
    implemented,
    unimplemented: scheduled - implemented,
    completionRate: rate(implemented, scheduled),
    observations: computeObservations(instances),
  };
};

/**
 * GET /manager/reports/regional — FRD §3.12.2
 * One row per region for the given month.
 */
const getRegionalReport = async ({ year, month, region: regionFilter }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  const instances = await fetchMonthInstances(y, m, regionFilter);

  // Group by region.
  const regions = new Map();
  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    const r = rs?.region || '—'; // bucket rows with missing region under "—"

    let row = regions.get(r);
    if (!row) {
      row = { region: r, branches: new Set(), scheduled: 0, implemented: 0 };
      regions.set(r, row);
    }
    row.branches.add(inst.scheduledVisit.regionSchedulingId);
    row.scheduled += 1;
    if (inst.status === 'IMPLEMENTED') row.implemented += 1;
  }

  const rows = Array.from(regions.values())
    .map((r) => ({
      region: r.region,
      branchCount: r.branches.size,
      scheduled: r.scheduled,
      implemented: r.implemented,
      unimplemented: r.scheduled - r.implemented,
      completionRate: rate(r.implemented, r.scheduled),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));

  return {
    year: y,
    month: m,
    filterRegion: regionFilter || null,
    rowCount: rows.length,
    rows,
  };
};

/**
 * GET /manager/reports/analysis — FRD §3.12.3
 * Month-by-month series for the requested year, optionally narrowed
 * to one region. Returns a flat `data` array keyed by (month, region)
 * so the frontend can pivot it into a stacked bar chart however it
 * likes.
 *
 * We always return rows for ALL 12 months of the year — months with
 * zero scheduled visits come back with all-zero counters. This makes
 * chart rendering trivial (no missing-month gaps to handle).
 */
const getMonthlyAnalysis = async ({ year, region: regionFilter }) => {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();

  /**
   * Fetch a whole year at once and group in JS. Doing 12 separate
   * queries would be ~12× round trips for a tiny payload. One round
   * trip with a slightly wider date range is much cheaper.
   */
  const instances = await prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { deletedAt: null, year: y },
        regionScheduling: {
          deletedAt: null,
          ...(regionFilter && { region: { contains: regionFilter, mode: 'insensitive' } }),
        },
      },
    },
    select: {
      status: true,
      scheduledVisit: {
        select: {
          regionSchedulingId: true,
          monthlySchedule: { select: { month: true } },
          regionScheduling: { select: { region: true } },
        },
      },
    },
  });

  /**
   * Keyed by `${month}::${region}`. Pre-seed all 12 months × ALL
   * encountered regions so the response shape is dense.
   */
  const cells = new Map();
  const regionsSeen = new Set();
  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    regionsSeen.add(rs?.region || '—');
  }

  for (let mo = 1; mo <= 12; mo++) {
    for (const r of regionsSeen) {
      cells.set(`${mo}::${r}`, {
        month: mo,
        region: r,
        branches: new Set(),
        scheduled: 0,
        implemented: 0,
      });
    }
  }

  for (const inst of instances) {
    const mo = inst.scheduledVisit?.monthlySchedule?.month;
    const rs = inst.scheduledVisit?.regionScheduling;
    if (!mo) continue;
    const r = rs?.region || '—';
    const cell = cells.get(`${mo}::${r}`);
    if (!cell) continue;

    cell.branches.add(inst.scheduledVisit.regionSchedulingId);
    cell.scheduled += 1;
    if (inst.status === 'IMPLEMENTED') cell.implemented += 1;
  }

  const data = Array.from(cells.values())
    .map((c) => ({
      month: c.month,
      region: c.region,
      branchCount: c.branches.size,
      scheduled: c.scheduled,
      implemented: c.implemented,
      unimplemented: c.scheduled - c.implemented,
      completionRate: rate(c.implemented, c.scheduled),
    }))
    .sort((a, b) => a.month - b.month || a.region.localeCompare(b.region));

  return {
    year: y,
    filterRegion: regionFilter || null,
    regions: Array.from(regionsSeen).sort(),
    data,
  };
};

/**
 * ============================================
 * Additional Tasks (manager side) — FRD §3.9
 * ============================================
 * Manager-assigned ad-hoc visits. CRUD + search + filter + export.
 * The supervisor's visit lifecycle (start / complete / photos / OTP)
 * lives in Phase C.2 — for now tasks are created in REMAINING state
 * and the visit fields stay at their defaults.
 *
 * `managerId` on every row is the creator. We currently let any
 * MANAGER read / update any task (no per-manager scope) — matches the
 * Manager-wide visibility used elsewhere in this module.
 */

const serializeAdditionalTask = (t) => ({
  id: t.id,
  manager: t.manager
    ? { id: t.manager.id, nameAr: t.manager.nameAr, nameEn: t.manager.nameEn }
    : null,
  supervisor: t.supervisor
    ? { id: t.supervisor.id, nameAr: t.supervisor.nameAr, nameEn: t.supervisor.nameEn }
    : null,
  companyName: t.companyName,
  branchName: t.branchName,
  categoryName: t.categoryName,
  brandName: [t.branchName, t.categoryName].filter(Boolean).join(' — ') || null,
  address: t.address,
  location: t.location,
  latitude: t.latitude,
  longitude: t.longitude,
  visitDate: t.visitDate,
  price: t.price,
  notes: t.notes,
  status: t.status,
  documentationStatus: t.documentationStatus,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/**
 * Validate that the chosen supervisor exists, is enabled, and is
 * actually a SUPERVISOR. Run on create AND update — accidentally
 * assigning a task to a manager would let it silently disappear from
 * every supervisor's pending list.
 */
const assertValidSupervisor = async (supervisorId) => {
  const u = await prisma.user.findFirst({
    where: { id: supervisorId, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!u) throw ApiError.badRequest('Supervisor not found');
  if (u.status === 'BLOCKED') throw ApiError.badRequest('Supervisor is blocked');
  return u;
};

const createAdditionalTask = async (managerId, body) => {
  await assertValidSupervisor(body.supervisorId);

  const task = await prisma.additionalTask.create({
    data: {
      managerId,
      supervisorId: body.supervisorId,
      companyName: body.companyName,
      branchName: body.branchName ?? null,
      categoryName: body.categoryName ?? null,
      address: body.address,
      location: body.location ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      visitDate: new Date(body.visitDate),
      price: body.price ?? null,
      notes: body.notes ?? null,
    },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });

  return serializeAdditionalTask(task);
};

const buildAdditionalTasksWhere = (q) => {
  const where = { deletedAt: null };

  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };
  if (q.supervisorId) where.supervisorId = q.supervisorId;
  if (q.companyName) where.companyName = { contains: q.companyName, mode: 'insensitive' };
  if (q.branchName) where.branchName = { contains: q.branchName, mode: 'insensitive' };
  if (q.brandName) {
    // Brand = branchName + categoryName; we OR them since the user
    // is searching the displayed brand name.
    where.OR = [
      { branchName: { contains: q.brandName, mode: 'insensitive' } },
      { categoryName: { contains: q.brandName, mode: 'insensitive' } },
    ];
  }
  if (q.address) where.address = { contains: q.address, mode: 'insensitive' };
  if (q.status) where.status = q.status;
  if (q.documentationStatus) where.documentationStatus = q.documentationStatus;

  if (q.dateFrom || q.dateTo) {
    where.visitDate = {};
    if (q.dateFrom) where.visitDate.gte = new Date(q.dateFrom);
    if (q.dateTo) where.visitDate.lte = new Date(q.dateTo);
  }

  // Supervisor name search uses a join — keep it last so the simpler
  // top-level filters compose first.
  if (q.supervisorName) {
    where.supervisor = {
      OR: [
        { nameAr: { contains: q.supervisorName, mode: 'insensitive' } },
        { nameEn: { contains: q.supervisorName, mode: 'insensitive' } },
      ],
    };
  }

  return where;
};

const listAdditionalTasks = async (rawQuery) => {
  const { page = 1, limit = 20, sort = 'newest', ...filters } = rawQuery;
  const where = buildAdditionalTasksWhere(filters);

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'visitDate') orderBy = { visitDate: 'asc' };
  else orderBy = { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.additionalTask.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
        supervisor: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.additionalTask.count({ where }),
  ]);

  return {
    items: items.map(serializeAdditionalTask),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getAdditionalTaskById = async (id) => {
  const task = await prisma.additionalTask.findFirst({
    where: { id, deletedAt: null },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!task) throw ApiError.notFound('Additional task not found');
  return serializeAdditionalTask(task);
};

const updateAdditionalTask = async (id, body) => {
  const existing = await prisma.additionalTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Additional task not found');

  if (body.supervisorId) await assertValidSupervisor(body.supervisorId);

  const data = {};
  // Only set the fields the caller explicitly sent. We don't want a
  // partial PATCH to wipe `notes` just because the form didn't include
  // it.
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('supervisorId');
  setIf('companyName');
  setIf('branchName', (v) => v ?? null);
  setIf('categoryName', (v) => v ?? null);
  setIf('address');
  setIf('location', (v) => v ?? null);
  setIf('latitude', (v) => v ?? null);
  setIf('longitude', (v) => v ?? null);
  setIf('visitDate', (v) => new Date(v));
  setIf('price', (v) => v ?? null);
  setIf('notes', (v) => v ?? null);

  const updated = await prisma.additionalTask.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });

  return serializeAdditionalTask(updated);
};

/**
 * Soft delete. We keep the row for audit + reporting; future
 * /reports endpoints can still see it if they include deletedAt rows
 * (they don't, by default).
 */
const deleteAdditionalTask = async (id) => {
  const existing = await prisma.additionalTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Additional task not found');

  await prisma.additionalTask.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

/**
 * Flat-row shape for the Excel/PDF exporters.
 */
const ADDITIONAL_TASKS_EXPORT_LIMIT = 5000;

const listAdditionalTasksForExport = async (rawQuery) => {
  const where = buildAdditionalTasksWhere(rawQuery);

  const items = await prisma.additionalTask.findMany({
    where,
    orderBy: { visitDate: 'asc' },
    take: ADDITIONAL_TASKS_EXPORT_LIMIT,
    include: {
      manager: { select: { nameAr: true, nameEn: true } },
      supervisor: { select: { nameAr: true, nameEn: true } },
    },
  });

  return items.map((t) => ({
    supervisor: t.supervisor
      ? `${t.supervisor.nameAr}${t.supervisor.nameEn ? ` (${t.supervisor.nameEn})` : ''}`
      : null,
    companyName: t.companyName,
    brandName: [t.branchName, t.categoryName].filter(Boolean).join(' — ') || null,
    address: t.address,
    location: t.location,
    visitDate: t.visitDate ? new Date(t.visitDate).toISOString().slice(0, 10) : null,
    price: t.price ? Number(t.price) : null,
    status: t.status,
    documentationStatus: t.documentationStatus,
    notes: t.notes,
  }));
};

module.exports = {
  getMyProfile,
  listTeams,
  listTeamsForExport,
  listBranches,
  getBranchDetail,
  listBranchesForExport,
  getMonthlyReportByCompany,
  buildMonthlyReportByCompanyFlatRows,
  listCustomers,
  listDailyVisits,
  getOverallSummary,
  getRegionalReport,
  getMonthlyAnalysis,
  // Additional tasks
  createAdditionalTask,
  listAdditionalTasks,
  getAdditionalTaskById,
  updateAdditionalTask,
  deleteAdditionalTask,
  listAdditionalTasksForExport,
};

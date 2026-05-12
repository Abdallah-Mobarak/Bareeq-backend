const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Company-side read API for COMPANY_USER and ACCOUNTANT_MANAGER.
 *
 * Both roles see "their company's data" but at different scopes:
 *   • COMPANY_USER       → everything under their company
 *   • ACCOUNTANT_MANAGER → either the whole company (assignedToAllBranches=true)
 *                          OR only the explicit rows in
 *                          accountant_manager_region_schedulings.
 *
 * The scoping helpers in this file are the single source of truth — every
 * future endpoint must route its branch lookups through them so the AM
 * branch boundary can't be bypassed by accident.
 */

const visitTypesFor = (n) => Array.from({ length: n }, (_, i) => `V${i + 1}`);

/**
 * Resolve the authenticated user with their Company eager-loaded.
 * Throws if the link is missing — we never want to silently
 * scope-to-everything when the join is broken.
 */
const loadUserWithCompany = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { company: true },
  });
  if (!user) throw ApiError.unauthorized('User not found');
  if (!user.companyId || !user.company) {
    throw ApiError.internal('User has no associated company');
  }
  return user;
};

/**
 * Build the Prisma `where` fragment that limits regionScheduling rows
 * to the ones the authenticated user is allowed to see.
 *
 *   • COMPANY_USER                    → companyName matches the company.
 *   • AM with assignedToAllBranches   → same as COMPANY_USER.
 *   • AM with explicit branches       → id IN (assigned ids) AND companyName
 *                                       matches (defense-in-depth against
 *                                       cross-company assignments).
 *
 * Returns a `where`-fragment (object) so callers can spread it into a
 * larger query: `regionScheduling: { ...scope, ...filters }`.
 *
 * Why a name-string match instead of an FK? RegionScheduling.companyName
 * is a free-text field per FRD §4.2.2.2.1 (admins import branches via
 * Excel before any Company row exists). The Company row created via
 * Assign Company is linked back by name. This is by design — do not
 * "fix" it with an FK without re-reading the FRD.
 */
const scopeForUser = async (user) => {
  const companyNameFilter = { companyName: user.company.nameAr };

  if (user.role === 'COMPANY_USER') {
    return companyNameFilter;
  }

  if (user.role === 'ACCOUNTANT_MANAGER') {
    if (user.assignedToAllBranches) {
      return companyNameFilter;
    }
    const rows = await prisma.accountantManagerRegionScheduling.findMany({
      where: { userId: user.id },
      select: { regionSchedulingId: true },
    });
    const ids = rows.map((r) => r.regionSchedulingId);

    // FR-23: hide every branch that isn't assigned.
    // If the AM has zero assignments we still want an *empty* result set,
    // not "all of the company". `id: { in: [] }` matches nothing.
    return { id: { in: ids }, ...companyNameFilter };
  }

  // Should be unreachable — requireRole already filtered at the route layer.
  throw ApiError.forbidden('Role not allowed in company portal');
};

/**
 * Profile shape (FRD §2.1 for COMPANY_USER, FR-7 for ACCOUNTANT_MANAGER).
 *
 *   • COMPANY_USER returns: id, role, name, email, phone, company.
 *   • ACCOUNTANT_MANAGER returns the same PLUS an `assignedBranches`
 *     object describing whether they cover the whole company
 *     (mode='all') or a specific list (mode='specific' with branch IDs).
 *
 * We keep the two shapes obviously different so the frontend can switch
 * UI without inspecting the role string twice.
 */
const getMyProfile = async (userId) => {
  const user = await loadUserWithCompany(userId);

  const baseProfile = {
    id: user.id,
    role: user.role,
    name: user.nameAr,
    nameEn: user.nameEn,
    email: user.email,
    phone: user.phone,
    company: {
      id: user.company.id,
      nameAr: user.company.nameAr,
      nameEn: user.company.nameEn,
    },
  };

  if (user.role !== 'ACCOUNTANT_MANAGER') {
    return baseProfile;
  }

  // FR-7: AMs also need their branch assignment summary on the profile.
  if (user.assignedToAllBranches) {
    return {
      ...baseProfile,
      assignedBranches: { mode: 'all', branches: [] },
    };
  }

  const explicitRows = await prisma.accountantManagerRegionScheduling.findMany({
    where: { userId },
    include: {
      regionScheduling: {
        select: {
          id: true,
          branchName: true,
          categoryName: true,
          branchNumber: true,
          city: true,
        },
      },
    },
  });

  return {
    ...baseProfile,
    assignedBranches: {
      mode: 'specific',
      branches: explicitRows
        .filter((r) => r.regionScheduling)
        .map((r) => ({
          id: r.regionScheduling.id,
          branchName: r.regionScheduling.branchName,
          categoryName: r.regionScheduling.categoryName,
          branchNumber: r.regionScheduling.branchNumber,
          city: r.regionScheduling.city,
        })),
    },
  };
};

/**
 * Serialize one ScheduledVisit row for the branch-listing endpoint.
 * Each row carries the regionScheduling (branch metadata) and its visit
 * instances (V1..V4). The shape mirrors what the supervisor sees per
 * FRD §2.2.1, minus fields the company shouldn't care about.
 */
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
        // FRD §2.2.1 — "Brand name (Branch name + Category name)"
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

  /**
   * Each instance carries its own status + documentation status. The
   * company UI uses these to render per-visit badges per FRD §2.2.1.
   * "No Action" in the FRD == REMAINING in our enum (no terminal status yet).
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

/**
 * Build the Prisma `where` for /company/branches.
 *
 * Composition order is important:
 *   1. The role-based scope (companyName / explicit AM ids) is the
 *      outermost guarantee. Filters can only NARROW within that scope.
 *   2. Free-text search (`q`) applies inside the scope.
 *   3. visitStatus filter uses `visitInstances.some` so a row matches
 *      if ANY of its V's has the requested status.
 */
const buildBranchesWhere = ({ scope, query }) => {
  const {
    q,
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
    visitStatus,
  } = query;

  const where = {
    deletedAt: null,
    monthlySchedule: {
      deletedAt: null,
      ...(year !== undefined && { year }),
      ...(month !== undefined && { month }),
    },
    regionScheduling: {
      deletedAt: null,
      ...scope, // ← role-based scoping comes FIRST so filters can't bypass it
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
      { branchName: { contains: q, mode: 'insensitive' } },
      { categoryName: { contains: q, mode: 'insensitive' } },
      { branchNumber: { contains: q } },
      { city: { contains: q, mode: 'insensitive' } },
      { region: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  /**
   * Date / status filters on visitInstances.
   *
   * FRD §2.2.3 lets the company filter by either a date range or a
   * specific visit status. We merge them under a single `some` clause
   * so a row is included only if there's at least one instance that
   * satisfies BOTH conditions simultaneously (avoids the bug where a
   * row with a Nov visit and a Dec different status passes both
   * filters separately).
   */
  const instanceClauses = {};
  if (dateFrom && dateTo) {
    instanceClauses.scheduledDate = { gte: new Date(dateFrom), lte: new Date(dateTo) };
  } else if (dateFrom) {
    instanceClauses.scheduledDate = { gte: new Date(dateFrom) };
  } else if (dateTo) {
    instanceClauses.scheduledDate = { lte: new Date(dateTo) };
  }
  if (visitStatus) {
    // FRD §2.2.3 statuses map to our enum directly except "No Action" → REMAINING.
    instanceClauses.status = visitStatus === 'NO_ACTION' ? 'REMAINING' : visitStatus;
  }
  if (Object.keys(instanceClauses).length > 0) {
    where.visitInstances = { some: { deletedAt: null, ...instanceClauses } };
  }

  return where;
};

/**
 * GET /company/branches — FRD §2.2.1
 *
 * Returns a paginated list of branches the user is allowed to see in
 * the given month (defaults to current month). Each row carries its
 * full visit-instance state so the UI can render per-V status badges.
 */
const listMyBranches = async (userId, rawQuery) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const now = new Date();
  const query = {
    ...rawQuery,
    year: rawQuery.year ?? now.getUTCFullYear(),
    month: rawQuery.month ?? now.getUTCMonth() + 1,
  };

  const where = buildBranchesWhere({ scope, query });
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
 * GET /company/branches/:id — FRD §2.2.5 (Companies — View Branch Details)
 *                         / FR-39 → FR-48 (Accountant Manager — same view, scoped)
 *
 * `:id` is a ScheduledVisit id (same id space as /company/branches list).
 * Returns the branch metadata plus the FULL per-visit-instance state so
 * the UI can render photos, tasks, durations, and documentation answers.
 *
 * Authorization is folded into the lookup: we require the row to match
 * the user's scope (`scopeForUser`). If it doesn't, we return 404 — NOT
 * 403 — to avoid leaking the existence of branches that belong to other
 * companies (typical "object capability" pattern; the same way GitHub
 * returns 404 for private repos you don't have access to).
 */
const getMyBranchDetail = async (userId, scheduledVisitId) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const sv = await prisma.scheduledVisit.findFirst({
    where: {
      id: scheduledVisitId,
      deletedAt: null,
      monthlySchedule: { deletedAt: null },
      regionScheduling: { deletedAt: null, ...scope },
    },
    include: {
      monthlySchedule: { select: { year: true, month: true } },
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
    // Either truly missing or out-of-scope. We do not distinguish on purpose.
    throw ApiError.notFound('Branch not found');
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
      // FRD §2.2.5 — "Brand name (Branch name + Category name)"
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
      // Required tasks blueprint for the UI to render task lists per V.
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
    /**
     * Per FRD §2.2.5 we return EVERY field that may be needed for the
     * branch-detail UI in one shot — start/end times, duration, photos,
     * task checks (Done / Not Done), and the optional documentation
     * answers (jobNumber, rating, comments). Sensitive fields like the
     * OTP hash are NEVER serialized; only documentedAt indicates whether
     * the visit reached the DOCUMENTED state.
     */
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
 * GET /company/monthly-report — FRD §2.3 (Companies)
 *                              + FR-49 → FR-55 (Accountant Manager)
 *
 * Aggregates the month's visits into a per-branch breakdown PLUS grand
 * totals. Every count is scoped via `scopeForUser` so an AM with limited
 * branches only ever sees their slice (FR-51 / FR-52 / FR-55).
 *
 * Semantics, straight from the FRD:
 *   • "Number of visits"            → ALL instances scheduled in the month
 *   • "Number of visits implemented"→ status = IMPLEMENTED
 *   • "Number of visits remaining"  → total − implemented
 *
 * Note: unlike supervisor §1.3 which exposes 4 statuses separately, the
 * company report intentionally collapses Final-Closed and Not-Implemented
 * into "remaining" because the FRD §2.3.1 only asks for two columns
 * (implemented vs remaining). Do not "improve" by adding the other two
 * without re-reading the spec.
 */
const getMyMonthlyReport = async (userId, { year, month }) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  /**
   * Pull every VisitInstance for the given month that belongs to a
   * branch the user is allowed to see. One query, no N+1.
   *
   * We fetch instances (not scheduledVisits) because the report is per
   * visit-type — each instance becomes a single tally tick.
   */
  const instances = await prisma.visitInstance.findMany({
    where: {
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { deletedAt: null, year: y, month: m },
        regionScheduling: { deletedAt: null, ...scope },
      },
    },
    select: {
      visitOrder: true,
      status: true,
      scheduledVisit: {
        select: {
          regionScheduling: {
            select: {
              id: true,
              branchName: true,
              categoryName: true,
              city: true,
              numberOfVisits: true,
            },
          },
        },
      },
    },
  });

  /**
   * Per-branch accumulators. Keyed by regionScheduling.id so we keep
   * each branch separate even if two share the same brand-name string.
   * Initialised lazily as we encounter the first instance for a branch.
   */
  const branches = new Map();
  const ensureBranch = (rs) => {
    if (branches.has(rs.id)) return branches.get(rs.id);
    const row = {
      regionSchedulingId: rs.id,
      branchName: rs.branchName,
      categoryName: rs.categoryName,
      brandName: [rs.branchName, rs.categoryName].filter(Boolean).join(' — '),
      city: rs.city,
      numberOfVisits: rs.numberOfVisits,
      perVisitType: {},
      totals: { total: 0, implemented: 0, remaining: 0 },
    };
    // Pre-seed visit type buckets so V's with zero instances still
    // appear in the response (the frontend can render an empty column
    // instead of falling off the end of the table).
    for (let i = 1; i <= rs.numberOfVisits; i++) {
      row.perVisitType[`V${i}`] = { total: 0, implemented: 0, remaining: 0 };
    }
    branches.set(rs.id, row);
    return row;
  };

  // Grand totals across all branches.
  const grandPerV = {};
  const grandAll = { total: 0, implemented: 0, remaining: 0 };

  for (const inst of instances) {
    const rs = inst.scheduledVisit?.regionScheduling;
    if (!rs) continue; // defensive — should never happen with the joins above

    const row = ensureBranch(rs);
    const isImplemented = inst.status === 'IMPLEMENTED';

    // Per-branch tally.
    const vKey = `V${inst.visitOrder}`;
    const bucket = row.perVisitType[vKey] || { total: 0, implemented: 0, remaining: 0 };
    bucket.total += 1;
    if (isImplemented) bucket.implemented += 1;
    else bucket.remaining += 1;
    row.perVisitType[vKey] = bucket;

    row.totals.total += 1;
    if (isImplemented) row.totals.implemented += 1;
    else row.totals.remaining += 1;

    // Grand totals.
    const gBucket = grandPerV[vKey] || { total: 0, implemented: 0, remaining: 0 };
    gBucket.total += 1;
    if (isImplemented) gBucket.implemented += 1;
    else gBucket.remaining += 1;
    grandPerV[vKey] = gBucket;

    grandAll.total += 1;
    if (isImplemented) grandAll.implemented += 1;
    else grandAll.remaining += 1;
  }

  // Stable ordering: by brandName then city so the same report renders
  // the same way every time (helps in tests and UI snapshots).
  const rows = Array.from(branches.values()).sort((a, b) => {
    const bn = (a.brandName || '').localeCompare(b.brandName || '');
    return bn !== 0 ? bn : (a.city || '').localeCompare(b.city || '');
  });

  return {
    year: y,
    month: m,
    branchCount: rows.length,
    rows,
    totals: {
      branchCount: rows.length,
      perVisitType: grandPerV,
      all: grandAll,
    },
  };
};

/**
 * Flat status summary string for a ScheduledVisit row's instances.
 * Returns "V1: IMPLEMENTED, V2: UNDERWAY, V3: REMAINING, ..." — perfect
 * for a single Excel/PDF cell. We use the raw enum values so the file
 * matches what the API returns elsewhere (no silent translation here).
 */
const instancesStatusSummary = (instances) =>
  (instances || [])
    .slice()
    .sort((a, b) => a.visitOrder - b.visitOrder)
    .map((i) => `V${i.visitOrder}: ${i.status}`)
    .join(', ');

/**
 * Same lookup as listMyBranches but without pagination — returns every
 * row that matches the scope and filters. Used by the Excel / PDF
 * exporters (FRD §2.2.4). Capped at 5000 rows: that's already 100+
 * pages of PDF and well past the size any company should be exporting
 * in a single request; if we ever exceed it we'll switch to streaming.
 */
const EXPORT_HARD_LIMIT = 5000;

const listMyBranchesForExport = async (userId, rawQuery) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const now = new Date();
  const query = {
    ...rawQuery,
    year: rawQuery.year ?? now.getUTCFullYear(),
    month: rawQuery.month ?? now.getUTCMonth() + 1,
  };

  const where = buildBranchesWhere({ scope, query });

  const items = await prisma.scheduledVisit.findMany({
    where,
    orderBy: { firstVisitDate: 'asc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      monthlySchedule: { select: { year: true, month: true } },
      regionScheduling: true,
      visitInstances: {
        where: { deletedAt: null },
        orderBy: { visitOrder: 'asc' },
        select: { visitOrder: true, status: true, documentationStatus: true },
      },
    },
  });

  // Flatten the nested structure into one record per branch — the
  // shape the exporters' column configs expect.
  return items.map((sv) => ({
    brandName: [sv.regionScheduling?.branchName, sv.regionScheduling?.categoryName]
      .filter(Boolean)
      .join(' — '),
    branchNumber: sv.regionScheduling?.branchNumber,
    visitDate: sv.firstVisitDate
      ? new Date(sv.firstVisitDate).toISOString().slice(0, 10)
      : null,
    city: sv.regionScheduling?.city,
    address: sv.regionScheduling?.address,
    region: sv.regionScheduling?.region,
    location: sv.regionScheduling?.location,
    numberOfVisits: sv.regionScheduling?.numberOfVisits,
    code: sv.regionScheduling?.code,
    visitTypes: visitTypesFor(sv.regionScheduling?.numberOfVisits || 0).join(', '),
    statuses: instancesStatusSummary(sv.visitInstances),
  }));
};

/**
 * Flatten the monthly report into one row per (branch × visit type) so
 * the Excel and PDF renderers can dump it into a flat table. The grand
 * totals are added as a final summary row so accountants can spot them
 * without scrolling through the data section first.
 *
 * Returns { rows, year, month, branchCount, totals } so the renderer
 * can also embed the totals in the file header / subtitle.
 */
const buildMonthlyReportFlatRows = async (userId, query) => {
  const report = await getMyMonthlyReport(userId, query);

  const rows = [];
  for (const row of report.rows) {
    for (const [vKey, counts] of Object.entries(row.perVisitType)) {
      rows.push({
        brandName: row.brandName,
        city: row.city,
        visitType: vKey,
        total: counts.total,
        implemented: counts.implemented,
        remaining: counts.remaining,
      });
    }
  }

  return { ...report, flatRows: rows };
};

/**
 * POST /company/contact — FRD §2.4 (Companies) + FR-63 → FR-68 (AM).
 *
 * Stores a Contact-Us message from the authenticated user. The form
 * fields `email`, `phone`, `message` are captured separately from the
 * User's login email/phone because FR-65 explicitly asks the user to
 * re-enter them, suggesting they may differ from the login identity.
 *
 * No "send notification to admin" side-effect yet — when we wire the
 * notifications module, this is the hook point.
 */
const submitContactMessage = async (userId, { email, phone, message }) => {
  // Confirm the user is still a valid COMPANY_USER / AM before persisting.
  // Defensive check on top of the route's requireRole — if a user is
  // soft-deleted between auth and write, we don't want to insert a row
  // pointing at a dangling user_id.
  const user = await loadUserWithCompany(userId);

  const row = await prisma.contactMessage.create({
    data: {
      userId: user.id,
      email,
      phone,
      message,
    },
  });

  return serializeContactMessage(row);
};

/**
 * GET /company/contact/my-messages — pulls the user's own message
 * history including any admin replies. There's no scope concern beyond
 * "own messages" — `userId = req.user.id` is the entire authorization.
 *
 * Returns newest-first so the UI default screen shows the most recent
 * conversation. Pagination is supported but optional; default page
 * size is small (20) because mobile clients render this as a chat-like
 * list and rarely need more in one go.
 */
const listMyContactMessages = async (userId, { page = 1, limit = 20 }) => {
  const [items, total] = await prisma.$transaction([
    prisma.contactMessage.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contactMessage.count({ where: { userId, deletedAt: null } }),
  ]);

  return {
    items: items.map(serializeContactMessage),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Public-facing shape for a ContactMessage row. We never leak the
 * `repliedByAdminId` (admin identity is irrelevant to the company) —
 * only the reply text and time matter.
 */
const serializeContactMessage = (row) => ({
  id: row.id,
  email: row.email,
  phone: row.phone,
  message: row.message,
  status: row.status,
  reply: row.reply,
  repliedAt: row.repliedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

module.exports = {
  getMyProfile,
  listMyBranches,
  getMyBranchDetail,
  getMyMonthlyReport,
  listMyBranchesForExport,
  buildMonthlyReportFlatRows,
  submitContactMessage,
  listMyContactMessages,
  // Exported for downstream endpoints that need the same scope.
  loadUserWithCompany,
  scopeForUser,
};

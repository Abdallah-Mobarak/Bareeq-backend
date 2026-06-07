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

/**
 * Build the ScheduledVisit `where` clause for an optional period filter.
 * Returns null when neither year nor month is given (caller then uses the
 * "any non-deleted visit" default). ADDITIONAL visits have no
 * monthlySchedule, so a month/year filter naturally excludes them — that's
 * intended: the period filter is about the monthly plan.
 */
const schedulePeriodClause = (year, month) => {
  if (!year && !month) {
    return null;
  }
  return {
    deletedAt: null,
    monthlySchedule: {
      deletedAt: null,
      ...(year && { year }),
      ...(month && { month }),
    },
  };
};

/** Prisma select for a minimal person reference (supervisor / accountant manager). */
const PERSON_SELECT = { id: true, nameAr: true, nameEn: true };

/**
 * The supervisor responsible for a scheduled visit:
 *   • REGULAR    → the supervisor on the monthly schedule.
 *   • ADDITIONAL → the explicitly assigned supervisor.
 */
const visitSupervisor = (sv) =>
  (sv.type === 'REGULAR' ? sv.monthlySchedule?.supervisor : sv.assignedToSupervisor) || null;

/** DISTINCT supervisors across a branch's scheduled visits. */
const collectSupervisors = (scheduledVisits = []) => {
  const map = new Map();
  for (const sv of scheduledVisits) {
    const sup = visitSupervisor(sv);
    if (sup && !map.has(sup.id)) {
      map.set(sup.id, sup);
    }
  }
  return [...map.values()];
};

/**
 * The DISTINCT accountant managers covering a branch:
 *   • explicit assignments via the AccountantManagerRegionScheduling M:N
 *     table (rs.accountantAssignments), PLUS
 *   • the company's "all-branches" AMs (assignedToAllBranches=true), which
 *     implicitly cover every branch — passed in once per request.
 * Mirrors the coverage logic in assign-company.
 */
const collectAccountantManagers = (accountantAssignments = [], allBranchAms = []) => {
  const map = new Map();
  for (const am of allBranchAms) {
    if (!map.has(am.id)) {
      map.set(am.id, am);
    }
  }
  for (const a of accountantAssignments) {
    const u = a.user;
    if (u && !map.has(u.id)) {
      map.set(u.id, u);
    }
  }
  return [...map.values()];
};

/**
 * The company's "all-branches" accountant managers — AMs whose
 * assignedToAllBranches flag implicitly covers EVERY branch of the company.
 * Fetched once per request and applied to every branch row.
 */
const companyAllBranchAccountantManagers = (companyId) =>
  prisma.user.findMany({
    where: {
      companyId,
      role: 'ACCOUNTANT_MANAGER',
      assignedToAllBranches: true,
      deletedAt: null,
    },
    select: PERSON_SELECT,
  });

/**
 * Serialize a RegionScheduling row for /company/all-branches.
 *
 * This is the WHOLE branch catalogue, so the row carries the branch's own
 * attributes plus the DISTINCT supervisors and accountant managers assigned
 * to it — but NO per-month visit status (a branch may not be scheduled at
 * all). `id` here is the RegionScheduling id, NOT a ScheduledVisit id like
 * /company/branches returns — different id spaces, so don't feed one into
 * the other's :id route. `allBranchAms` is the company's all-branches AM
 * list, shared across rows.
 */
const serializeAllBranchRow = (rs, allBranchAms = []) => ({
  id: rs.id,
  companyName: rs.companyName,
  branchName: rs.branchName,
  categoryName: rs.categoryName,
  // FRD §2.2.1 — "Brand name (Branch name + Category name)".
  brandName: [rs.branchName, rs.categoryName].filter(Boolean).join(' — '),
  branchNumber: rs.branchNumber,
  city: rs.city,
  region: rs.region,
  address: rs.address,
  location: rs.location,
  latitude: rs.latitude,
  longitude: rs.longitude,
  numberOfVisits: rs.numberOfVisits,
  code: rs.code,
  visitTypes: visitTypesFor(rs.numberOfVisits),
  assignedSupervisors: collectSupervisors(rs.scheduledVisits),
  assignedAccountantManagers: collectAccountantManagers(rs.accountantAssignments, allBranchAms),
});

/**
 * GET /company/all-branches
 *
 * Lists EVERY branch that belongs to the caller's company, read straight
 * from the RegionScheduling catalogue (what the admin imported from Excel).
 * Unlike listMyBranches, it is NOT scoped to a month and does NOT require a
 * ScheduledVisit to exist — so a freshly-imported branch with no visits yet
 * still appears.
 *
 * Authorization reuses scopeForUser: COMPANY_USER / all-branches AM see the
 * whole company; an AM with specific assignments sees only their branches.
 * Because the base model here IS RegionScheduling, the scope fragment is
 * applied at the top level (not nested under a `regionScheduling` relation).
 */
const listAllMyBranches = async (userId, rawQuery) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const {
    page,
    limit,
    sort,
    q,
    branchName,
    categoryName,
    branchNumber,
    city,
    region,
    address,
    code,
    visitType,
    year,
    month,
  } = rawQuery;

  // When a period is given, only show branches scheduled in it, and only
  // pull that period's visits when resolving the assigned supervisors.
  const periodClause = schedulePeriodClause(year, month);

  const where = {
    deletedAt: null,
    ...scope, // companyName (+ id IN for specific AMs) — outermost guarantee
    ...(branchName && { branchName: { contains: branchName, mode: 'insensitive' } }),
    ...(categoryName && { categoryName: { contains: categoryName, mode: 'insensitive' } }),
    ...(branchNumber && { branchNumber: { contains: branchNumber } }),
    ...(city && { city: { contains: city, mode: 'insensitive' } }),
    ...(region && { region: { contains: region, mode: 'insensitive' } }),
    ...(address && { address: { contains: address, mode: 'insensitive' } }),
    ...(code && { code: { contains: code, mode: 'insensitive' } }),
    ...(visitType && { numberOfVisits: { gte: visitType } }),
    ...(periodClause && { scheduledVisits: { some: periodClause } }),
  };

  if (q) {
    where.OR = [
      { branchName: { contains: q, mode: 'insensitive' } },
      { categoryName: { contains: q, mode: 'insensitive' } },
      { branchNumber: { contains: q } },
      { city: { contains: q, mode: 'insensitive' } },
      { region: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  let orderBy;
  if (sort === 'newest') {
    orderBy = { createdAt: 'desc' };
  } else if (sort === 'oldest') {
    orderBy = { createdAt: 'asc' };
  } else {
    orderBy = [{ branchName: 'asc' }, { city: 'asc' }];
  }

  const [allBranchAms, [items, total]] = await Promise.all([
    companyAllBranchAccountantManagers(user.company.id),
    prisma.$transaction([
      prisma.regionScheduling.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          // Pulled only to derive `assignedSupervisors`. Scoped to the period
          // when one is given so the supervisor names match the filter.
          scheduledVisits: {
            where: periodClause || { deletedAt: null },
            select: {
              type: true,
              monthlySchedule: { select: { supervisor: { select: PERSON_SELECT } } },
              assignedToSupervisor: { select: PERSON_SELECT },
            },
          },
          // Explicit accountant-manager assignments for this branch.
          accountantAssignments: {
            where: { user: { role: 'ACCOUNTANT_MANAGER', deletedAt: null } },
            select: { user: { select: PERSON_SELECT } },
          },
        },
      }),
      prisma.regionScheduling.count({ where }),
    ]),
  ]);

  return {
    items: items.map((rs) => serializeAllBranchRow(rs, allBranchAms)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /company/all-branches/:id
 *
 * `:id` is a RegionScheduling id (what /company/all-branches returns per
 * row) — NOT a ScheduledVisit id. Returns the branch metadata + required
 * tasks + EVERY scheduled visit for the branch (across months), each with
 * its supervisor, manager (ADDITIONAL only), and per-V status. Optional
 * year/month narrows which scheduled visits come back.
 *
 * Authorization is folded into the lookup via scopeForUser: an out-of-scope
 * or missing branch returns 404 (object-capability pattern, same as
 * getMyBranchDetail) so we never leak other companies' branches.
 */
const getMyAllBranchDetail = async (userId, regionSchedulingId, { year, month } = {}) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  const periodClause = schedulePeriodClause(year, month);

  const [allBranchAms, rs] = await Promise.all([
    companyAllBranchAccountantManagers(user.company.id),
    prisma.regionScheduling.findFirst({
      where: { id: regionSchedulingId, deletedAt: null, ...scope },
      include: {
        requiredTasks: { orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }] },
        // Explicit accountant-manager assignments for this branch.
        accountantAssignments: {
          where: { user: { role: 'ACCOUNTANT_MANAGER', deletedAt: null } },
          select: { user: { select: PERSON_SELECT } },
        },
        scheduledVisits: {
          where: periodClause || { deletedAt: null },
          orderBy: { firstVisitDate: 'asc' },
          include: {
            monthlySchedule: {
              select: { year: true, month: true, supervisor: { select: PERSON_SELECT } },
            },
            assignedToSupervisor: { select: PERSON_SELECT },
            visitInstances: {
              where: { deletedAt: null },
              orderBy: { visitOrder: 'asc' },
              select: {
                id: true,
                visitOrder: true,
                scheduledDate: true,
                status: true,
                documentationStatus: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!rs) {
    // Either truly missing or out-of-scope. We do not distinguish on purpose.
    throw ApiError.notFound('Branch not found');
  }

  return {
    id: rs.id,
    companyName: rs.companyName,
    branchName: rs.branchName,
    categoryName: rs.categoryName,
    brandName: [rs.branchName, rs.categoryName].filter(Boolean).join(' — '),
    branchNumber: rs.branchNumber,
    city: rs.city,
    region: rs.region,
    address: rs.address,
    location: rs.location,
    latitude: rs.latitude,
    longitude: rs.longitude,
    numberOfVisits: rs.numberOfVisits,
    code: rs.code,
    visitTypes: visitTypesFor(rs.numberOfVisits),
    requiredTasks: rs.requiredTasks.map((t) => ({
      id: t.id,
      visitType: t.visitType,
      titleAr: t.titleAr,
      titleEn: t.titleEn,
      sortOrder: t.sortOrder,
    })),
    assignedSupervisors: collectSupervisors(rs.scheduledVisits),
    assignedAccountantManagers: collectAccountantManagers(rs.accountantAssignments, allBranchAms),
    // One entry per scheduled visit (month) the branch belongs to.
    schedules: rs.scheduledVisits.map((sv) => ({
      scheduledVisitId: sv.id,
      type: sv.type,
      year: sv.monthlySchedule?.year ?? null,
      month: sv.monthlySchedule?.month ?? null,
      firstVisitDate: sv.firstVisitDate,
      supervisor: visitSupervisor(sv),
      instances: sv.visitInstances.map((i) => ({
        id: i.id,
        visitOrder: i.visitOrder,
        scheduledDate: i.scheduledDate,
        status: i.status,
        documentationStatus: i.documentationStatus,
      })),
    })),
  };
};

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
    ids,
  } = query;

  const where = {
    deletedAt: null,
    /**
     * `ids` ANDs on top of the role scope — an AM passing a branch id
     * outside their assignment simply gets an empty intersection, never
     * a leak. Safe because the regionScheduling sub-clause below still
     * carries the scope.
     */
    ...(ids && ids.length > 0 && { id: { in: ids } }),
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
 * Every VisitStatus value, in display order. Source of truth for the
 * dashboard's zero-fill so a status with no rows still renders a "0"
 * card instead of vanishing. Mirrors the Prisma `VisitStatus` enum —
 * keep in sync if the enum ever grows.
 */
const VISIT_STATUS_KEYS = [
  'REMAINING', // no action yet
  'UNDERWAY', // started, not finished
  'IMPLEMENTED', // completed
  'NOT_IMPLEMENTED', // skipped with a reason ("not visited")
  'FINAL_CLOSED', // branch permanently closed
];

const DOCUMENTATION_KEYS = ['DOCUMENTED', 'UNDOCUMENTED'];

/**
 * Safety cap on how many VisitInstance rows the dashboard loads in one
 * shot. Every figure below (counts AND the branches list) is derived from
 * this single fetch, so the cap bounds both memory and response size. A
 * company-scoped query realistically returns a few hundred rows (dozens of
 * branches × up to 4 visits × a handful of months); 20k is far past that
 * while still protecting us from a pathological tenant. If we ever hit it,
 * switch to DB-side groupBy for the counts and paginate the list.
 */
const DASHBOARD_INSTANCE_LIMIT = 20000;

/**
 * Build the `scheduledDate` range clause shared by the dashboard's date
 * filter. Returns `undefined` when no bound is given so callers can spread
 * it conditionally. Matches the semantics used by /company/branches and
 * /manager/branches (filter on the instance's scheduledDate).
 */
const scheduledDateRange = ({ dateFrom, dateTo }) => {
  if (dateFrom && dateTo) return { gte: new Date(dateFrom), lte: new Date(dateTo) };
  if (dateFrom) return { gte: new Date(dateFrom) };
  if (dateTo) return { lte: new Date(dateTo) };
  return undefined;
};

/**
 * GET /company/dashboard — home-screen summary + per-branch breakdown.
 *
 * Scoped via `scopeForUser` so a COMPANY_USER sees their whole company and
 * an ACCOUNTANT_MANAGER sees only their assigned branches (same boundary as
 * every other endpoint here).
 *
 * Optional date filter (`dateFrom` / `dateTo`, inclusive, on the visit's
 * scheduledDate) answers "in this period, how many branches were acted on?".
 * When given, EVERY figure except `totalBranches` is restricted to visits
 * inside the range; a branch only appears in the list / action counts if it
 * has at least one visit in the range.
 *
 * Returns:
 *   • totalBranches    → all branches the user can see (RegionScheduling
 *                        rows in scope). ALL-TIME on purpose — it's the
 *                        stable "your company has N branches" figure and is
 *                        NOT narrowed by the date filter, unlike everything
 *                        else here.
 *   • totalVisits      → visit instances in scope (and in the date range).
 *   • visitsByStatus   → one count per VisitStatus, zero-filled so the UI
 *                        always renders a fixed set of cards.
 *   • documentation    → DOCUMENTED / UNDOCUMENTED counts (orthogonal to
 *                        status — a visit can be IMPLEMENTED yet still
 *                        UNDOCUMENTED).
 *   • branchesByAction → { withAction, noAction } over the branches that
 *                        have ≥1 visit in the considered set. "withAction" =
 *                        the branch has ≥1 visit whose status != REMAINING
 *                        (same definition as the /manager/branches
 *                        ?hasAction filter); "noAction" = every one of its
 *                        visits is still REMAINING. The two sum to the
 *                        number of branches in `branches`.
 *   • branches         → one entry per distinct branch: companyName,
 *                        address, brandName, firstVisitDate, hasAction, and
 *                        the full per-visit status list. Visits across
 *                        multiple months are merged under the branch (each
 *                        carries its own scheduledDate so they stay
 *                        distinguishable).
 *   • completedVisits / pendingVisits → aliases for the original two cards.
 *
 * Implementation note: we fetch the in-scope instances ONCE and derive every
 * figure in JS. One source of truth means the list and the counts can never
 * disagree (e.g. branchesByAction.withAction always matches the branches you
 * can see flagged hasAction:true).
 */
const getMyDashboardStats = async (userId, rawQuery = {}) => {
  const user = await loadUserWithCompany(userId);
  const scope = await scopeForUser(user);

  // The role scope is expressed against RegionScheduling; the branch count
  // applies it directly, the visit query reaches it through the join.
  const branchScope = { deletedAt: null, ...scope };
  const dateClause = scheduledDateRange(rawQuery);

  const visitWhere = {
    deletedAt: null,
    ...(dateClause && { scheduledDate: dateClause }),
    scheduledVisit: {
      deletedAt: null,
      monthlySchedule: { deletedAt: null },
      regionScheduling: branchScope,
    },
  };

  const [totalBranches, instances] = await prisma.$transaction([
    // ALL-TIME, never date-filtered — see doc comment.
    prisma.regionScheduling.count({ where: branchScope }),
    prisma.visitInstance.findMany({
      where: visitWhere,
      take: DASHBOARD_INSTANCE_LIMIT,
      orderBy: { scheduledDate: 'asc' },
      select: {
        visitOrder: true,
        scheduledDate: true,
        status: true,
        documentationStatus: true,
        scheduledVisit: {
          select: {
            firstVisitDate: true,
            regionScheduling: {
              select: {
                id: true,
                companyName: true,
                branchName: true,
                categoryName: true,
                address: true,
                city: true,
                region: true,
                numberOfVisits: true,
              },
            },
          },
        },
      },
    }),
  ]);

  // Zero-filled accumulators so every card key is always present.
  const visitsByStatus = Object.fromEntries(VISIT_STATUS_KEYS.map((k) => [k, 0]));
  const documentation = Object.fromEntries(DOCUMENTATION_KEYS.map((k) => [k, 0]));
  const branchesMap = new Map();
  let totalVisits = 0;

  for (const inst of instances) {
    const sv = inst.scheduledVisit;
    const rs = sv?.regionScheduling;
    if (!rs) continue; // defensive — the joins above guarantee it exists

    totalVisits += 1;
    if (visitsByStatus[inst.status] !== undefined) visitsByStatus[inst.status] += 1;
    if (documentation[inst.documentationStatus] !== undefined) {
      documentation[inst.documentationStatus] += 1;
    }

    let branch = branchesMap.get(rs.id);
    if (!branch) {
      branch = {
        regionSchedulingId: rs.id,
        companyName: rs.companyName,
        branchName: rs.branchName,
        categoryName: rs.categoryName,
        // FRD §2.2.1 — "Brand name (Branch name + Category name)".
        brandName: [rs.branchName, rs.categoryName].filter(Boolean).join(' — '),
        address: rs.address,
        city: rs.city,
        region: rs.region,
        numberOfVisits: rs.numberOfVisits,
        firstVisitDate: sv.firstVisitDate,
        hasAction: false,
        visits: [],
      };
      branchesMap.set(rs.id, branch);
    }

    // Earliest scheduled visit date wins across this branch's months.
    if (sv.firstVisitDate && (!branch.firstVisitDate || sv.firstVisitDate < branch.firstVisitDate)) {
      branch.firstVisitDate = sv.firstVisitDate;
    }
    if (inst.status !== 'REMAINING') branch.hasAction = true;

    branch.visits.push({
      visitOrder: inst.visitOrder,
      scheduledDate: inst.scheduledDate,
      status: inst.status,
      documentationStatus: inst.documentationStatus,
    });
  }

  const branches = Array.from(branchesMap.values());
  for (const branch of branches) {
    branch.visits.sort(
      (a, b) =>
        a.visitOrder - b.visitOrder ||
        new Date(a.scheduledDate) - new Date(b.scheduledDate),
    );
  }
  // Stable, predictable ordering for the UI and tests.
  branches.sort(
    (a, b) =>
      (a.brandName || '').localeCompare(b.brandName || '') ||
      (a.city || '').localeCompare(b.city || ''),
  );

  const withAction = branches.filter((b) => b.hasAction).length;

  return {
    totalBranches,
    totalVisits,
    visitsByStatus,
    documentation,
    branchesByAction: {
      withAction,
      noAction: branches.length - withAction,
    },
    // Aliases for the original summary cards (kept for backward compat).
    completedVisits: visitsByStatus.IMPLEMENTED,
    pendingVisits: visitsByStatus.REMAINING,
    dateRange: {
      from: rawQuery.dateFrom ?? null,
      to: rawQuery.dateTo ?? null,
    },
    branches,
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
  getMyDashboardStats,
  listMyBranches,
  listAllMyBranches,
  getMyAllBranchDetail,
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

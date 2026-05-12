const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Supervisor-facing read + state-transition API for AdditionalTask.
 * Mirrors visit-instances semantics but on a different table:
 *
 *   REMAINING ──┬─► UNDERWAY ──► IMPLEMENTED   (terminal, locked)
 *               ├─► FINAL_CLOSED                (terminal, locked)
 *               └─► NOT_IMPLEMENTED             (terminal, locked, reason required)
 *
 * Photos / required-task checks / OTP documentation are deferred to a
 * later phase (C.3). Status transitions and read endpoints are enough
 * to demo an end-to-end "manager assigns → supervisor closes the loop"
 * flow today.
 *
 * Scope: every query / mutation is scoped by `supervisorId = req.user.id`.
 * Returns 404 (NOT 403) for tasks the caller doesn't own — same
 * object-capability pattern used in the Company Portal.
 */

const TERMINAL_STATUSES = new Set(['IMPLEMENTED', 'FINAL_CLOSED', 'NOT_IMPLEMENTED']);

const serializeTask = (t) => ({
  id: t.id,
  manager: t.manager
    ? { id: t.manager.id, nameAr: t.manager.nameAr, nameEn: t.manager.nameEn }
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
  // Visit-execution state (populated once the supervisor acts on the task).
  // NOTE: AdditionalTask doesn't yet have these columns — Phase C.3 will
  // add them via migration. For now they read as null from the service.
  startedAt: t.startedAt ?? null,
  endedAt: t.endedAt ?? null,
  durationSeconds: t.durationSeconds ?? null,
  startLatitude: t.startLatitude ?? null,
  startLongitude: t.startLongitude ?? null,
  lockedAt: t.lockedAt ?? null,
  notImplementedReason: t.notImplementedReason ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/**
 * Load a task scoped to the calling supervisor. 404 if missing or
 * out-of-scope so we don't leak which IDs belong to other supervisors.
 */
const loadOwned = async (taskId, supervisorId, tx = prisma) => {
  const task = await tx.additionalTask.findFirst({
    where: { id: taskId, supervisorId, deletedAt: null },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      notImplementedReason: { select: { id: true, titleAr: true, titleEn: true } },
    },
  });
  if (!task) throw ApiError.notFound('Additional task not found');
  return task;
};

const buildWhere = (supervisorId, q) => {
  const where = { supervisorId, deletedAt: null };

  if (q.companyName) where.companyName = { contains: q.companyName, mode: 'insensitive' };
  if (q.branchName) where.branchName = { contains: q.branchName, mode: 'insensitive' };
  if (q.brandName) {
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

  return where;
};

/**
 * GET /supervisor/additional-tasks — FRD §1.4.1 + §1.4.2 + §1.4.3.
 * Paginated list of tasks the supervisor is responsible for, with
 * search + filter + status filter. Default sort: visitDate ascending
 * (do the soonest tasks first).
 */
const listMyTasks = async (supervisorId, rawQuery) => {
  const { page = 1, limit = 20, sort = 'visitDate', ...filters } = rawQuery;
  const where = buildWhere(supervisorId, filters);

  let orderBy;
  if (sort === 'newest') orderBy = { createdAt: 'desc' };
  else if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else orderBy = { visitDate: 'asc' };

  const [items, total] = await prisma.$transaction([
    prisma.additionalTask.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.additionalTask.count({ where }),
  ]);

  return {
    items: items.map(serializeTask),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /supervisor/additional-tasks/:id — FRD §1.4.4.
 */
const getMyTaskDetail = async (supervisorId, taskId) => {
  const task = await loadOwned(taskId, supervisorId);
  return serializeTask(task);
};

const EXPORT_HARD_LIMIT = 5000;

const listMyTasksForExport = async (supervisorId, rawQuery) => {
  const where = buildWhere(supervisorId, rawQuery);

  const items = await prisma.additionalTask.findMany({
    where,
    orderBy: { visitDate: 'asc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      manager: { select: { nameAr: true, nameEn: true } },
    },
  });

  return items.map((t) => ({
    companyName: t.companyName,
    brandName: [t.branchName, t.categoryName].filter(Boolean).join(' — ') || null,
    address: t.address,
    location: t.location,
    visitDate: t.visitDate ? new Date(t.visitDate).toISOString().slice(0, 10) : null,
    price: t.price ? Number(t.price) : null,
    status: t.status,
    documentationStatus: t.documentationStatus,
    assignedBy: t.manager
      ? `${t.manager.nameAr}${t.manager.nameEn ? ` (${t.manager.nameEn})` : ''}`
      : null,
    notes: t.notes,
  }));
};

/**
 * Guard: throw if the task already has a terminal status. Used by every
 * state-mutation entry point so the supervisor can't "restart" a task
 * they've already closed.
 */
const assertNotLocked = (task) => {
  if (TERMINAL_STATUSES.has(task.status)) {
    throw ApiError.conflict(`Task is already ${task.status} and cannot be modified`);
  }
};

/**
 * POST /supervisor/additional-tasks/:id/start
 * REMAINING → UNDERWAY. Records GPS + startedAt timestamp.
 *
 * NOTE on visit-execution columns: AdditionalTask doesn't carry the
 * execution columns yet (startedAt, endedAt, durationSeconds,
 * startLatitude/Longitude, lockedAt, notImplementedReasonId) — they'll
 * be added by the Phase C.3 migration. Until then the START endpoint
 * only flips `status` to UNDERWAY so the flow is testable end-to-end.
 * Photos / OTP / required-tasks land in Phase C.3.
 */
const startTask = async (supervisorId, taskId, { latitude: _lat, longitude: _lng }) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);
    assertNotLocked(task);
    if (task.status !== 'REMAINING') {
      throw ApiError.conflict(`Task is ${task.status}, only REMAINING tasks can be started`);
    }

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: { status: 'UNDERWAY' },
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/complete
 * UNDERWAY → IMPLEMENTED. Terminal.
 */
const completeTask = async (supervisorId, taskId) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);
    assertNotLocked(task);
    if (task.status !== 'UNDERWAY') {
      throw ApiError.conflict(`Task is ${task.status}, only UNDERWAY tasks can be completed`);
    }

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: { status: 'IMPLEMENTED' },
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/final-closed
 * REMAINING → FINAL_CLOSED. Terminal — branch is permanently closed.
 */
const finalCloseTask = async (supervisorId, taskId) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);
    assertNotLocked(task);
    if (task.status !== 'REMAINING') {
      throw ApiError.conflict(
        `Task is ${task.status}; FINAL_CLOSED must be set before the visit is started`,
      );
    }

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: { status: 'FINAL_CLOSED' },
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/not-implemented
 * REMAINING → NOT_IMPLEMENTED. Reason required and stored as a free-text
 * `notes` append (since AdditionalTask doesn't have a FK to Reason yet —
 * Phase C.3 will add `notImplementedReasonId`).
 *
 * Calling this on a task that's already NOT_IMPLEMENTED is allowed and
 * updates the reason text — this matches the FRD §3.2 immutability
 * exception ("If Not Implemented was selected, the reason can be
 * updated").
 */
const notImplementTask = async (supervisorId, taskId, { reasonText }) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);

    // Allow updating the reason text on an already-NOT_IMPLEMENTED task.
    const updatableStatus =
      task.status === 'REMAINING' || task.status === 'NOT_IMPLEMENTED';
    if (!updatableStatus) {
      throw ApiError.conflict(
        `Task is ${task.status}; NOT_IMPLEMENTED must be set before the visit is started`,
      );
    }

    /**
     * Until the migration lands, we record the reason inline in `notes`
     * with a stable prefix the UI can parse out. Phase C.3 will replace
     * this with a FK to the Reasons table and drop the inline string.
     */
    const reasonPrefix = '[Not implemented reason] ';
    const previousNotes = task.notes || '';
    const cleaned = previousNotes
      .split('\n')
      .filter((line) => !line.startsWith(reasonPrefix))
      .join('\n')
      .trim();
    const stamped = `${reasonPrefix}${reasonText}`;
    const newNotes = cleaned ? `${cleaned}\n${stamped}` : stamped;

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: { status: 'NOT_IMPLEMENTED', notes: newNotes },
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    return serializeTask(updated);
  });
};

module.exports = {
  listMyTasks,
  getMyTaskDetail,
  listMyTasksForExport,
  startTask,
  completeTask,
  finalCloseTask,
  notImplementTask,
};

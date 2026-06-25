const path = require('node:path');
const fs = require('node:fs/promises');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Supervisor-facing read + state-transition API for AdditionalTask.
 * Mirrors visit-instances semantics but on a different table:
 *
 *   REMAINING ──┬─► UNDERWAY ──► IMPLEMENTED   (terminal, locked)
 *               ├─► FINAL_CLOSED                (terminal, locked)
 *               └─► NOT_IMPLEMENTED             (terminal, locked, reason required)
 *
 * Status transitions now PERSIST execution state (startedAt / endedAt /
 * durationSeconds / GPS / lockedAt / notImplementedReasonId / notes) just
 * like VisitInstance. Photos / required-task checks / OTP documentation for
 * additional tasks are still deferred to a later phase.
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
  // Visit-execution state, persisted when the supervisor acts on the task.
  startedAt: t.startedAt ?? null,
  endedAt: t.endedAt ?? null,
  durationSeconds: t.durationSeconds ?? null,
  startLatitude: t.startLatitude ?? null,
  startLongitude: t.startLongitude ?? null,
  lockedAt: t.lockedAt ?? null,
  notImplementedReason: t.notImplementedReason ?? null,
  notImplementedNote: t.notImplementedNote ?? null,
  visitNote: t.visitNote ?? null,
  // Visit documentation (FRD §1.4.4.1) — populated through the
  // additional-task-documentation OTP flow.
  branchManagerPhone: t.branchManagerPhone ?? null,
  jobNumber: t.jobNumber ?? null,
  rating: t.rating ?? null,
  comments: t.comments ?? null,
  documentedAt: t.documentedAt ?? null,
  photos: (t.photos || []).map((p) => ({
    id: p.id,
    url: p.url,
    sizeBytes: p.sizeBytes,
    mimeType: p.mimeType,
    uploadedAt: p.uploadedAt,
  })),
  // Manager-authored required tasks the supervisor must check off.
  taskChecks: (t.taskChecks || []).map((c) => ({
    id: c.id,
    titleAr: c.titleAr,
    titleEn: c.titleEn,
    sortOrder: c.sortOrder,
    done: c.done,
  })),
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
      photos: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
      taskChecks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!task) throw ApiError.notFound('Additional task not found');
  return task;
};

const buildWhere = (supervisorId, q) => {
  const where = { supervisorId, deletedAt: null };

  /**
   * `ids` ANDs with `supervisorId`, so passing another supervisor's
   * task id matches zero rows — no leak possible.
   */
  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };
  if (q.companyName) where.companyName = { contains: q.companyName, mode: 'insensitive' };
  if (q.branchName) where.branchName = { contains: q.branchName, mode: 'insensitive' };
  if (q.categoryName) where.categoryName = { contains: q.categoryName, mode: 'insensitive' };
  if (q.address) where.address = { contains: q.address, mode: 'insensitive' };

  // OR groups (search / brandName) are stacked under AND so they compose
  // with each other and with the direct equality filters above.
  const orGroups = [];
  if (q.search) {
    orGroups.push({
      OR: [
        { companyName: { contains: q.search, mode: 'insensitive' } },
        { branchName: { contains: q.search, mode: 'insensitive' } },
        { categoryName: { contains: q.search, mode: 'insensitive' } },
        { address: { contains: q.search, mode: 'insensitive' } },
      ],
    });
  }
  if (q.brandName) {
    orGroups.push({
      OR: [
        { branchName: { contains: q.brandName, mode: 'insensitive' } },
        { categoryName: { contains: q.brandName, mode: 'insensitive' } },
      ],
    });
  }
  if (orGroups.length > 0) where.AND = orGroups;

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

const TASK_INCLUDE = {
  manager: { select: { id: true, nameAr: true, nameEn: true } },
  notImplementedReason: { select: { id: true, titleAr: true, titleEn: true } },
};

/**
 * POST /supervisor/additional-tasks/:id/start
 * REMAINING → UNDERWAY. Persists the start timestamp + GPS (Figma "Start
 * visit" → timer starts, location captured).
 */
const startTask = async (supervisorId, taskId, { latitude, longitude }) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);
    assertNotLocked(task);
    if (task.status !== 'REMAINING') {
      throw ApiError.conflict(`Task is ${task.status}, only REMAINING tasks can be started`);
    }

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: {
        status: 'UNDERWAY',
        startedAt: new Date(),
        startLatitude: latitude,
        startLongitude: longitude,
      },
      include: TASK_INCLUDE,
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/complete
 * UNDERWAY → IMPLEMENTED. Stops the timer, computes duration, optionally
 * stores the supervisor's "Notes". Terminal + locked.
 */
const completeTask = async (supervisorId, taskId, { note } = {}) => {
  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);
    assertNotLocked(task);
    if (task.status !== 'UNDERWAY') {
      throw ApiError.conflict(`Task is ${task.status}, only UNDERWAY tasks can be completed`);
    }

    const now = new Date();
    const durationSeconds = task.startedAt
      ? Math.floor((now.getTime() - new Date(task.startedAt).getTime()) / 1000)
      : null;

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: {
        status: 'IMPLEMENTED',
        endedAt: now,
        durationSeconds,
        lockedAt: now,
        ...(note !== undefined && { visitNote: note || null }),
      },
      include: TASK_INCLUDE,
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/final-closed
 * REMAINING → FINAL_CLOSED. Terminal + locked — branch permanently closed.
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
      data: { status: 'FINAL_CLOSED', lockedAt: new Date() },
      include: TASK_INCLUDE,
    });
    return serializeTask(updated);
  });
};

/**
 * POST /supervisor/additional-tasks/:id/not-implemented
 * REMAINING → NOT_IMPLEMENTED. The reason is a FK into the admin-managed
 * Reasons table (`notImplementedReasonId`), matching the branch-visit flow;
 * an optional free-text `note` carries the "Other → Additional Notes" text.
 *
 * Calling this on an already-NOT_IMPLEMENTED task is allowed and updates the
 * reason/note — FRD §3.2 immutability exception ("the reason can be updated").
 */
const notImplementTask = async (
  supervisorId,
  taskId,
  { notImplementedReasonId, note },
) => {
  const reason = await prisma.notImplementedReason.findFirst({
    where: { id: notImplementedReasonId, deletedAt: null },
    select: { id: true },
  });
  if (!reason) {
    throw ApiError.badRequest('Reason not found');
  }

  return prisma.$transaction(async (tx) => {
    const task = await loadOwned(taskId, supervisorId, tx);

    const updatableStatus =
      task.status === 'REMAINING' || task.status === 'NOT_IMPLEMENTED';
    if (!updatableStatus) {
      throw ApiError.conflict(
        `Task is ${task.status}; NOT_IMPLEMENTED must be set before the visit is started`,
      );
    }

    const updated = await tx.additionalTask.update({
      where: { id: task.id },
      data: {
        status: 'NOT_IMPLEMENTED',
        documentationStatus: 'UNDOCUMENTED',
        notImplementedReasonId,
        ...(note !== undefined && { notImplementedNote: note || null }),
        lockedAt: task.lockedAt ?? new Date(),
      },
      include: TASK_INCLUDE,
    });
    return serializeTask(updated);
  });
};

/**
 * PATCH /supervisor/additional-tasks/:id/tasks/:taskCheckId.
 * Toggle a required task's done flag. Allowed while UNDERWAY — the
 * supervisor ticks tasks off during the visit (FRD §1.4.4.1).
 */
const toggleTaskCheck = async (taskId, taskCheckId, supervisorId, { done }) => {
  const task = await loadOwned(taskId, supervisorId);
  if (task.status !== 'UNDERWAY') {
    throw ApiError.conflict(
      `Tasks can only be checked while the visit is UNDERWAY (currently ${task.status})`,
    );
  }

  const tc = task.taskChecks.find((c) => c.id === taskCheckId);
  if (!tc) {
    throw ApiError.notFound('Task check not found for this task');
  }

  await prisma.additionalTaskCheck.update({
    where: { id: taskCheckId },
    data: { done },
  });

  const reread = await loadOwned(taskId, supervisorId);
  return serializeTask(reread);
};

// ── Photos (FRD §1.4.4.1 "upload or capture 3 to 4 photos") ───────────
const PHOTOS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'additional-tasks');
const PHOTO_PUBLIC_PREFIX = '/uploads/additional-tasks';
const MAX_PHOTOS_PER_TASK = 4;

const extFromMime = (mime) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
};

/**
 * POST /supervisor/additional-tasks/:id/photos.
 * Allowed while UNDERWAY (during the visit) or after IMPLEMENTED (§3.2 —
 * "if implemented, images can be modified"). Cumulative cap: 4 per task.
 */
const addPhotos = async (taskId, supervisorId, files) => {
  if (!files || files.length === 0) {
    throw ApiError.badRequest('No photos uploaded (field name: photos)');
  }

  const task = await loadOwned(taskId, supervisorId);
  if (!['UNDERWAY', 'IMPLEMENTED'].includes(task.status)) {
    throw ApiError.conflict(
      `Photos can only be uploaded while UNDERWAY or after IMPLEMENTED (currently ${task.status})`,
    );
  }

  const existing = task.photos.length;
  if (existing + files.length > MAX_PHOTOS_PER_TASK) {
    throw ApiError.badRequest(
      `Task already has ${existing} photo(s); max ${MAX_PHOTOS_PER_TASK} per task`,
    );
  }

  const dir = path.join(PHOTOS_DIR, taskId);
  await fs.mkdir(dir, { recursive: true });

  const created = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const ext = extFromMime(f.mimetype);
    const filename = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(path.join(dir, filename), f.buffer);
    created.push({
      additionalTaskId: taskId,
      url: `${PHOTO_PUBLIC_PREFIX}/${taskId}/${filename}`,
      sizeBytes: f.size,
      mimeType: f.mimetype,
    });
  }

  await prisma.additionalTaskPhoto.createMany({ data: created });

  const reread = await loadOwned(taskId, supervisorId);
  logger.info({ taskId, supervisorId, added: files.length }, 'Additional-task photos uploaded');
  return serializeTask(reread);
};

const deletePhoto = async (taskId, photoId, supervisorId) => {
  const task = await loadOwned(taskId, supervisorId);
  if (!['UNDERWAY', 'IMPLEMENTED'].includes(task.status)) {
    throw ApiError.conflict(`Photos cannot be removed while status is ${task.status}`);
  }
  const photo = task.photos.find((p) => p.id === photoId);
  if (!photo) {
    throw ApiError.notFound('Photo not found for this task');
  }
  await prisma.additionalTaskPhoto.update({
    where: { id: photoId },
    data: { deletedAt: new Date() },
  });
  const reread = await loadOwned(taskId, supervisorId);
  return serializeTask(reread);
};

module.exports = {
  listMyTasks,
  getMyTaskDetail,
  listMyTasksForExport,
  startTask,
  completeTask,
  finalCloseTask,
  notImplementTask,
  toggleTaskCheck,
  addPhotos,
  deletePhoto,
};

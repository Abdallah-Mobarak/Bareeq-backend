const fs = require('node:fs/promises');
const path = require('node:path');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Visit execution — FRD §1.2.3.1 (mobile supervisor flow).
 *
 * State machine for VisitInstance.status:
 *
 *   REMAINING ──┬─► UNDERWAY ──► IMPLEMENTED   (terminal, locked)
 *               ├─► FINAL_CLOSED                (terminal, locked + cascades)
 *               └─► NOT_IMPLEMENTED             (terminal, locked, reason required)
 *
 * Visits within a branch are executed in order: V1 must finish before
 * V2 can start, etc. (§1.3 Order of Visits.)
 *
 * Once locked, the only allowed mutations are:
 *   - reason update for NOT_IMPLEMENTED (§3.2)
 *   - photos add/remove for IMPLEMENTED (§3.2)
 * Everything else throws.
 */

const TERMINAL_STATUSES = new Set(['IMPLEMENTED', 'FINAL_CLOSED', 'NOT_IMPLEMENTED']);

/**
 * Load the instance + parent ScheduledVisit + its sibling instances,
 * scoped to the calling supervisor. Raises 404 if it doesn't belong
 * to them — supervisors can't even acknowledge other supervisors'
 * visits exist.
 */
const loadOwned = async (visitInstanceId, supervisorId, tx = prisma) => {
  const inst = await tx.visitInstance.findFirst({
    where: {
      id: visitInstanceId,
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { supervisorId, deletedAt: null },
      },
    },
    include: {
      scheduledVisit: {
        include: {
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
      },
      photos: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
      taskChecks: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!inst) {
    throw ApiError.notFound('Visit instance not found');
  }
  return inst;
};

const ensurePreviousVisitsClosed = (inst) => {
  const earlier = inst.scheduledVisit.visitInstances.filter(
    (v) => v.visitOrder < inst.visitOrder,
  );
  const blocking = earlier.find((v) => !TERMINAL_STATUSES.has(v.status));
  if (blocking) {
    throw ApiError.badRequest(
      `Cannot act on V${inst.visitOrder} while V${blocking.visitOrder} is still ${blocking.status}`,
      { blockingInstanceId: blocking.id },
    );
  }
};

const ensureRemaining = (inst) => {
  if (inst.status !== 'REMAINING') {
    throw ApiError.conflict(
      `Visit is already ${inst.status} and cannot be changed`,
      { currentStatus: inst.status, lockedAt: inst.lockedAt },
    );
  }
};

const ensureUnderway = (inst) => {
  if (inst.status !== 'UNDERWAY') {
    throw ApiError.conflict(
      `Visit must be UNDERWAY to take this action (currently ${inst.status})`,
    );
  }
};

const serialize = (i) => ({
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
  notImplementedReasonId: i.notImplementedReasonId,
  branchManagerPhone: i.branchManagerPhone,
  jobNumber: i.jobNumber,
  rating: i.rating,
  comments: i.comments,
  documentedAt: i.documentedAt,
  photos: (i.photos || []).map((p) => ({
    id: p.id,
    url: p.url,
    sizeBytes: p.sizeBytes,
    mimeType: p.mimeType,
    uploadedAt: p.uploadedAt,
  })),
  taskChecks: (i.taskChecks || []).map((tc) => ({
    id: tc.id,
    regionSchedulingTaskId: tc.regionSchedulingTaskId,
    titleAr: tc.titleAr,
    titleEn: tc.titleEn,
    done: tc.done,
  })),
});

/**
 * GET /visit-instances/:id
 * Read a single visit instance the supervisor owns. Same shape as
 * what the action endpoints return, so the mobile app can refresh
 * one row without re-fetching the whole branch detail.
 */
const getVisit = async (visitInstanceId, supervisorId) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  return serialize(inst);
};

/**
 * POST /visit-instances/:id/start
 * REMAINING → UNDERWAY. Records GPS + start time. Snapshots the
 * branch's required tasks for this V into VisitInstanceTaskCheck so
 * the supervisor can tick them off independently.
 */
const startVisit = async (visitInstanceId, supervisorId, { latitude, longitude }) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  ensureRemaining(inst);
  ensurePreviousVisitsClosed(inst);

  /**
   * Required tasks for THIS visit type only (V1's tasks for V1, etc.).
   * If none are defined, we still allow the visit to start; the
   * "must check at least one task" rule kicks in at /complete.
   */
  const tasksForThisV = inst.scheduledVisit.regionScheduling.requiredTasks.filter(
    (t) => t.visitType === inst.visitOrder,
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.visitInstance.update({
      where: { id: visitInstanceId },
      data: {
        status: 'UNDERWAY',
        startedAt: new Date(),
        startLatitude: latitude,
        startLongitude: longitude,
      },
    });

    if (tasksForThisV.length > 0 && inst.taskChecks.length === 0) {
      await tx.visitInstanceTaskCheck.createMany({
        data: tasksForThisV.map((t) => ({
          visitInstanceId,
          regionSchedulingTaskId: t.id,
          titleAr: t.titleAr,
          titleEn: t.titleEn,
          done: false,
        })),
      });
    }

    return loadOwned(visitInstanceId, supervisorId, tx);
  });

  logger.info({ visitInstanceId, supervisorId }, 'Visit started');
  return serialize(updated);
};

/**
 * POST /visit-instances/:id/final-closed (FRD §2.1).
 * Branch is permanently closed. Cascades subsequent V's to
 * NOT_IMPLEMENTED + UNDOCUMENTED automatically and locks them.
 */
const finalClosedVisit = async (visitInstanceId, supervisorId) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  ensureRemaining(inst);
  ensurePreviousVisitsClosed(inst);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.visitInstance.update({
      where: { id: visitInstanceId },
      data: {
        status: 'FINAL_CLOSED',
        documentationStatus: 'UNDOCUMENTED',
        lockedAt: now,
      },
    });

    // Cascade: all later V's become NOT_IMPLEMENTED, point back here.
    const laterIds = inst.scheduledVisit.visitInstances
      .filter((v) => v.visitOrder > inst.visitOrder && v.status === 'REMAINING')
      .map((v) => v.id);
    if (laterIds.length > 0) {
      await tx.visitInstance.updateMany({
        where: { id: { in: laterIds } },
        data: {
          status: 'NOT_IMPLEMENTED',
          documentationStatus: 'UNDOCUMENTED',
          cascadedFromVisitInstanceId: visitInstanceId,
          lockedAt: now,
        },
      });
    }

    return loadOwned(visitInstanceId, supervisorId, tx);
  });

  logger.info({ visitInstanceId, supervisorId }, 'Visit final-closed (with cascade)');
  return serialize(updated);
};

/**
 * POST /visit-instances/:id/not-implemented
 * Skip this V with a reason. Reason is required; FE sources from
 * /reasons (admin-managed list).
 */
const notImplementedVisit = async (visitInstanceId, supervisorId, { notImplementedReasonId }) => {
  const reason = await prisma.notImplementedReason.findFirst({
    where: { id: notImplementedReasonId, deletedAt: null },
  });
  if (!reason) {
    throw ApiError.badRequest('Reason not found');
  }

  const inst = await loadOwned(visitInstanceId, supervisorId);
  // Two cases:
  //  (a) REMAINING → mark NOT_IMPLEMENTED with reason.
  //  (b) NOT_IMPLEMENTED already → reason can be updated (§3.2 exception).
  // Anything else throws.
  if (inst.status === 'REMAINING') {
    ensurePreviousVisitsClosed(inst);
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.visitInstance.update({
        where: { id: visitInstanceId },
        data: {
          status: 'NOT_IMPLEMENTED',
          documentationStatus: 'UNDOCUMENTED',
          notImplementedReasonId,
          lockedAt: now,
        },
      });
      return loadOwned(visitInstanceId, supervisorId, tx);
    });
    logger.info({ visitInstanceId, supervisorId }, 'Visit marked not-implemented');
    return serialize(updated);
  }

  if (inst.status === 'NOT_IMPLEMENTED') {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.visitInstance.update({
        where: { id: visitInstanceId },
        data: { notImplementedReasonId },
      });
      return loadOwned(visitInstanceId, supervisorId, tx);
    });
    logger.info({ visitInstanceId, supervisorId }, 'Not-implemented reason updated');
    return serialize(updated);
  }

  throw ApiError.conflict(
    `Cannot mark not-implemented while status is ${inst.status}`,
  );
};

/**
 * POST /visit-instances/:id/complete (FRD §2.4).
 * UNDERWAY → IMPLEMENTED. Stops timer, computes duration.
 * Requires at least one task checked done (§2.3).
 */
const completeVisit = async (visitInstanceId, supervisorId) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  ensureUnderway(inst);

  const anyTaskDone = inst.taskChecks.some((tc) => tc.done);
  if (inst.taskChecks.length > 0 && !anyTaskDone) {
    throw ApiError.badRequest(
      'You must check at least one task before completing the visit',
    );
  }

  const now = new Date();
  const durationSeconds = inst.startedAt
    ? Math.floor((now.getTime() - new Date(inst.startedAt).getTime()) / 1000)
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.visitInstance.update({
      where: { id: visitInstanceId },
      data: {
        status: 'IMPLEMENTED',
        endedAt: now,
        durationSeconds,
        lockedAt: now,
      },
    });
    return loadOwned(visitInstanceId, supervisorId, tx);
  });

  logger.info({ visitInstanceId, supervisorId, durationSeconds }, 'Visit completed');
  return serialize(updated);
};

/**
 * PATCH /visit-instances/:id/tasks/:taskCheckId
 * Toggle a task's done flag during UNDERWAY.
 */
const toggleTaskCheck = async (visitInstanceId, taskCheckId, supervisorId, { done }) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  ensureUnderway(inst);

  const tc = inst.taskChecks.find((t) => t.id === taskCheckId);
  if (!tc) {
    throw ApiError.notFound('Task check not found for this visit');
  }

  await prisma.visitInstanceTaskCheck.update({
    where: { id: taskCheckId },
    data: { done },
  });

  const reread = await loadOwned(visitInstanceId, supervisorId);
  return serialize(reread);
};

const PHOTOS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'visits');
const PHOTO_PUBLIC_PREFIX = '/uploads/visits';
const MAX_PHOTOS_PER_VISIT = 4;

const extFromMime = (mime) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
};

/**
 * POST /visit-instances/:id/photos (FRD §2.3).
 * Allowed during UNDERWAY (initial upload) and IMPLEMENTED (§3.2 —
 * "if implemented, images can be modified"). Cumulative cap: 4 photos
 * per visit instance.
 */
const addPhotos = async (visitInstanceId, supervisorId, files) => {
  if (!files || files.length === 0) {
    throw ApiError.badRequest('No photos uploaded (field name: photos)');
  }

  const inst = await loadOwned(visitInstanceId, supervisorId);
  if (!['UNDERWAY', 'IMPLEMENTED'].includes(inst.status)) {
    throw ApiError.conflict(
      `Photos can only be uploaded while UNDERWAY or after IMPLEMENTED (currently ${inst.status})`,
    );
  }

  const existing = inst.photos.length;
  if (existing + files.length > MAX_PHOTOS_PER_VISIT) {
    throw ApiError.badRequest(
      `Visit already has ${existing} photo(s); max ${MAX_PHOTOS_PER_VISIT} per visit`,
    );
  }

  // Persist files to disk under uploads/visits/<id>/<random>.<ext>
  const dir = path.join(PHOTOS_DIR, visitInstanceId);
  await fs.mkdir(dir, { recursive: true });

  const created = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const ext = extFromMime(f.mimetype);
    const filename = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const fullPath = path.join(dir, filename);
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(fullPath, f.buffer);
    created.push({
      visitInstanceId,
      url: `${PHOTO_PUBLIC_PREFIX}/${visitInstanceId}/${filename}`,
      sizeBytes: f.size,
      mimeType: f.mimetype,
    });
  }

  await prisma.visitInstancePhoto.createMany({ data: created });

  const reread = await loadOwned(visitInstanceId, supervisorId);
  logger.info(
    { visitInstanceId, supervisorId, added: files.length },
    'Visit photos uploaded',
  );
  return serialize(reread);
};

const deletePhoto = async (visitInstanceId, photoId, supervisorId) => {
  const inst = await loadOwned(visitInstanceId, supervisorId);
  // Allow during UNDERWAY or IMPLEMENTED (§3.2 image modification rule).
  if (!['UNDERWAY', 'IMPLEMENTED'].includes(inst.status)) {
    throw ApiError.conflict(
      `Photos cannot be removed while status is ${inst.status}`,
    );
  }
  const photo = inst.photos.find((p) => p.id === photoId);
  if (!photo) {
    throw ApiError.notFound('Photo not found for this visit');
  }
  await prisma.visitInstancePhoto.update({
    where: { id: photoId },
    data: { deletedAt: new Date() },
  });
  const reread = await loadOwned(visitInstanceId, supervisorId);
  return serialize(reread);
};

module.exports = {
  getVisit,
  startVisit,
  finalClosedVisit,
  notImplementedVisit,
  completeVisit,
  toggleTaskCheck,
  addPhotos,
  deletePhoto,
};

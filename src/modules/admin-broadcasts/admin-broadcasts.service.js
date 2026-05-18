const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Broadcast Notifications — FRD §4.14 / §3.6 marketplace.
 *
 * A "broadcast" is one admin action that fans out to many Notification
 * rows. We keep both:
 *   - NotificationBroadcast: the admin's intent (title, body, audience,
 *     who sent it, when, how many it reached).
 *   - Notification: the per-user delivery row, linked back via
 *     broadcastId (nullable FK; SetNull on broadcast delete so the
 *     user's inbox row survives admin housekeeping).
 *
 * Soft-delete policy: deleting a broadcast only hides it from the
 * admin's history view. The fanned-out Notification rows are NOT
 * cascade-deleted — once a user has seen a notification, retroactively
 * wiping it from their inbox is more surprising than helpful.
 */

const serializeBroadcast = (b) => ({
  id: b.id,
  sentByAdmin: b.sentByAdmin
    ? {
        id: b.sentByAdmin.id,
        nameAr: b.sentByAdmin.nameAr,
        nameEn: b.sentByAdmin.nameEn,
        email: b.sentByAdmin.email,
      }
    : null,
  titleAr: b.titleAr,
  titleEn: b.titleEn,
  bodyAr: b.bodyAr,
  bodyEn: b.bodyEn,
  audience: b.audience,
  recipientCount: b.recipientCount,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

/**
 * Resolve the audience descriptor into a concrete list of user ids.
 * Filters out soft-deleted and BLOCKED users in every branch — a
 * blocked user shouldn't receive announcement noise.
 *
 * Returns an array (possibly empty). The caller decides whether an
 * empty audience is an error.
 */
const resolveAudience = async (audience) => {
  const baseWhere = { deletedAt: null, status: 'ENABLED' };

  if (audience.kind === 'ALL') {
    const users = await prisma.user.findMany({
      where: baseWhere,
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  if (audience.kind === 'ROLES') {
    const users = await prisma.user.findMany({
      where: { ...baseWhere, role: { in: audience.roles } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  if (audience.kind === 'USERS') {
    /**
     * Validate the requested ids exist and are eligible. We don't
     * surface the per-id reject reason — just return whatever subset
     * is valid. The response's recipientCount tells the admin how
     * many of the N they sent actually got through.
     */
    const users = await prisma.user.findMany({
      where: { ...baseWhere, id: { in: audience.userIds } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  throw ApiError.badRequest(`Unknown audience kind: ${audience.kind}`);
};

/**
 * Send a broadcast. Resolves the audience, then in ONE transaction:
 *   1. creates the NotificationBroadcast row,
 *   2. fans out N Notification rows via createMany,
 *   3. returns the broadcast with recipientCount.
 *
 * If any step fails, the whole transaction rolls back — no half-sent
 * broadcast, no orphan broadcast row pointing at zero notifications.
 */
const sendBroadcast = async ({ adminId, titleAr, titleEn, bodyAr, bodyEn, audience }) => {
  const recipientIds = await resolveAudience(audience);

  if (recipientIds.length === 0) {
    throw ApiError.badRequest('Audience resolved to zero recipients');
  }

  const broadcast = await prisma.$transaction(async (tx) => {
    const created = await tx.notificationBroadcast.create({
      data: {
        sentByAdminId: adminId,
        titleAr,
        titleEn: titleEn || null,
        bodyAr,
        bodyEn: bodyEn || null,
        audience,
        recipientCount: recipientIds.length,
      },
      include: {
        sentByAdmin: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      },
    });

    /**
     * createMany is single-round-trip and ~100× faster than a loop of
     * create() calls. We're fine without skipDuplicates — Notification
     * has no unique constraint that this set could violate.
     */
    await tx.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        titleAr,
        titleEn: titleEn || null,
        bodyAr,
        bodyEn: bodyEn || null,
        broadcastId: created.id,
      })),
    });

    return created;
  });

  logger.info(
    {
      broadcastId: broadcast.id,
      adminId,
      audienceKind: audience.kind,
      recipientCount: recipientIds.length,
    },
    'Broadcast sent',
  );

  return serializeBroadcast(broadcast);
};

const listBroadcasts = async ({ page, limit, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
        { bodyAr: { contains: q, mode: 'insensitive' } },
        { bodyEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy = { createdAt: sort === 'oldest' ? 'asc' : 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.notificationBroadcast.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        sentByAdmin: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      },
    }),
    prisma.notificationBroadcast.count({ where }),
  ]);

  return {
    items: items.map(serializeBroadcast),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getBroadcast = async (id) => {
  const row = await prisma.notificationBroadcast.findFirst({
    where: { id, deletedAt: null },
    include: {
      sentByAdmin: { select: { id: true, nameAr: true, nameEn: true, email: true } },
    },
  });
  if (!row) throw ApiError.notFound('Broadcast not found');
  return serializeBroadcast(row);
};

/**
 * Soft-delete. Per the policy in the file header, this only hides the
 * broadcast from the admin's history list — the SetNull FK leaves
 * the recipients' Notification rows intact (now broadcastId=NULL).
 */
const deleteBroadcast = async (id) => {
  const existing = await prisma.notificationBroadcast.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Broadcast not found');

  await prisma.notificationBroadcast.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  logger.info({ broadcastId: id }, 'Broadcast soft-deleted');
};

module.exports = {
  sendBroadcast,
  listBroadcasts,
  getBroadcast,
  deleteBroadcast,
};

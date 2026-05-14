const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * In-app notifications — FRD §1.4 / §2.4 / §3.13 / §4.14.
 *
 * Public API:
 *   notify({ userId, type, ... })      → internal helper, called from
 *                                         OTHER module service layers.
 *                                         Never throws — a failed
 *                                         notification must not break
 *                                         the calling business flow.
 *   listMine, getUnreadCount,
 *   markRead, markAllRead              → HTTP-exposed via controller.
 */

const serialize = (n) => ({
  id: n.id,
  type: n.type,
  titleAr: n.titleAr,
  titleEn: n.titleEn,
  bodyAr: n.bodyAr,
  bodyEn: n.bodyEn,
  data: n.data,
  isRead: n.readAt !== null,
  readAt: n.readAt,
  createdAt: n.createdAt,
});

/**
 * Create a notification for a user. Designed to be FIRE-AND-FORGET:
 *   - Returns the created row on success, NULL on failure.
 *   - Never throws — every caller wraps its own business logic in a
 *     transaction; we don't want a logging-style side effect to bring
 *     the whole transaction down.
 *
 * Why a separate function rather than inlining `prisma.notification.create`
 * everywhere: future channels (push, email) will hook in here, plus
 * we centralise the "swallow errors" policy in one place.
 */
const notify = async ({ userId, type, titleAr, titleEn, bodyAr, bodyEn, data }) => {
  if (!userId || !type || !titleAr) {
    logger.error(
      { userId, type, titleAr },
      'notify() called with missing required fields — skipping',
    );
    return null;
  }

  try {
    const row = await prisma.notification.create({
      data: {
        userId,
        type,
        titleAr,
        titleEn: titleEn || null,
        bodyAr: bodyAr || null,
        bodyEn: bodyEn || null,
        data: data || undefined,
      },
    });
    return row;
  } catch (err) {
    // Defence-in-depth: a failed notification must not break the calling
    // business flow (e.g. SP accepts booking → notify customer fails →
    // booking acceptance still succeeds).
    logger.error({ err: err.message, userId, type }, 'notify() failed — caller flow continues');
    return null;
  }
};

const listMine = async (userId, { page, limit, unread, type }) => {
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(unread === true && { readAt: null }),
    ...(unread === false && { readAt: { not: null } }),
    ...(type && { type }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    items: items.map(serialize),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getUnreadCount = async (userId) => {
  const count = await prisma.notification.count({
    where: { userId, readAt: null },
  });
  return { unread: count };
};

const markRead = async (userId, id) => {
  // Use updateMany + count so we don't leak existence of someone
  // else's notification (object-capability — same pattern as bookings).
  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    // Either the notification doesn't exist, doesn't belong to us, or
    // was already read. Surface a single uniform error.
    const existing = await prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw ApiError.notFound('Notification not found');
    }
    // Already read — idempotent: return the current state.
    return serialize(existing);
  }

  const row = await prisma.notification.findUnique({ where: { id } });
  return serialize(row);
};

const markAllRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  logger.info({ userId, count: result.count }, 'Notifications mark-all-read');
  return { markedRead: result.count };
};

module.exports = { notify, listMine, getUnreadCount, markRead, markAllRead };

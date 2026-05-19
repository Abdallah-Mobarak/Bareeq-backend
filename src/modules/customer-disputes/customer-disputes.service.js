const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');

/**
 * Customer Disputes — FRD §3.6 marketplace.
 *
 * Customer files a complaint and can see their own filings + the
 * admin's response when one lands. Admin-side review lives in the
 * admin-disputes module — kept separate so role-scoped concerns
 * don't bleed into each other.
 */

const serializeDispute = (d) => ({
  id: d.id,
  subject: d.subject,
  message: d.message,
  status: d.status,
  bookingId: d.bookingId,
  adminResponse: d.adminResponse,
  respondedAt: d.respondedAt,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/**
 * Fan a "new dispute filed" notification out to every active admin.
 * Fire-and-forget — a notification failure must never roll back the
 * dispute itself. Wrapped here rather than at the call site so the
 * caller's create() stays focused on the happy path.
 */
const notifyAdminsOfNewDispute = async (dispute, filerRoleLabel) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ENABLED', deletedAt: null },
      select: { id: true },
    });

    await Promise.all(
      admins.map((a) =>
        notify({
          userId: a.id,
          type: 'DISPUTE_FILED',
          titleAr: `شكوى جديدة من ${filerRoleLabel.ar}`,
          titleEn: `New complaint from a ${filerRoleLabel.en}`,
          bodyAr: dispute.subject,
          bodyEn: dispute.subject,
          data: { disputeId: dispute.id, bookingId: dispute.bookingId },
        }),
      ),
    );
  } catch (err) {
    logger.error(
      { err: err.message, disputeId: dispute.id },
      'Admin notification fan-out failed — dispute created OK, admins missed the ping',
    );
  }
};

const fileDispute = async (customerId, body) => {
  /**
   * If the caller references a booking, prove it belongs to them. We
   * don't want a customer filing a dispute on a stranger's booking
   * just by guessing the id.
   */
  if (body.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, customerId },
      select: { id: true },
    });
    if (!booking) {
      throw ApiError.badRequest('bookingId does not reference any of your bookings');
    }
  }

  const dispute = await prisma.dispute.create({
    data: {
      userId: customerId,
      subject: body.subject,
      message: body.message,
      bookingId: body.bookingId || null,
    },
  });

  logger.info({ disputeId: dispute.id, customerId }, 'Customer dispute filed');

  // Best-effort admin notification.
  notifyAdminsOfNewDispute(dispute, { ar: 'عميل', en: 'customer' });

  return serializeDispute(dispute);
};

const listMine = async (customerId, { page, limit, status }) => {
  const skip = (page - 1) * limit;

  const where = {
    userId: customerId,
    deletedAt: null,
    ...(status && { status }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.dispute.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dispute.count({ where }),
  ]);

  return {
    items: items.map(serializeDispute),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getMine = async (customerId, disputeId) => {
  const d = await prisma.dispute.findFirst({
    where: { id: disputeId, userId: customerId, deletedAt: null },
  });
  if (!d) throw ApiError.notFound('Dispute not found');
  return serializeDispute(d);
};

module.exports = { fileDispute, listMine, getMine };

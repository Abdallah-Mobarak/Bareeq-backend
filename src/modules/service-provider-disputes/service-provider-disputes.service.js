const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');

/**
 * Service Provider Disputes — FRD §3.6 marketplace.
 * Mirror of customer-disputes.service — same flow, but scoped to the
 * SP's own bookings (assignedSpId) instead of the customer's.
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

const fileDispute = async (spId, body) => {
  /**
   * Booking ownership for an SP is via `assignedSpId`. PENDING bookings
   * aren't assigned yet, so SPs can only reference bookings they've
   * already accepted.
   */
  if (body.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, assignedSpId: spId },
      select: { id: true },
    });
    if (!booking) {
      throw ApiError.badRequest('bookingId does not reference any of your bookings');
    }
  }

  const dispute = await prisma.dispute.create({
    data: {
      userId: spId,
      subject: body.subject,
      message: body.message,
      bookingId: body.bookingId || null,
    },
  });

  logger.info({ disputeId: dispute.id, spId }, 'SP dispute filed');

  notifyAdminsOfNewDispute(dispute, { ar: 'مزود خدمة', en: 'service provider' });

  return serializeDispute(dispute);
};

const listMine = async (spId, { page, limit, status }) => {
  const skip = (page - 1) * limit;

  const where = {
    userId: spId,
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

const getMine = async (spId, disputeId) => {
  const d = await prisma.dispute.findFirst({
    where: { id: disputeId, userId: spId, deletedAt: null },
  });
  if (!d) throw ApiError.notFound('Dispute not found');
  return serializeDispute(d);
};

module.exports = { fileDispute, listMine, getMine };

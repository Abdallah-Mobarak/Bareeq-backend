const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');

/**
 * Admin-side disputes review — FRD §3.6 marketplace.
 *
 * Admin reads everyone's disputes, triages them through PENDING →
 * IN_REVIEW → RESOLVED, and writes back responses. Notifies the
 * filer whenever an admin response lands.
 */

/**
 * Serialiser used by list / detail responses. The admin sees the
 * filer's basic profile alongside the dispute itself. Booking
 * context is included as a thin reference (id + status) — the FE
 * can deep-link into the full booking record on demand.
 */
const serializeDispute = (d) => ({
  id: d.id,
  subject: d.subject,
  message: d.message,
  status: d.status,
  adminResponse: d.adminResponse,
  respondedAt: d.respondedAt,
  respondedByAdmin: d.respondedByAdmin
    ? {
        id: d.respondedByAdmin.id,
        nameAr: d.respondedByAdmin.nameAr,
        nameEn: d.respondedByAdmin.nameEn,
      }
    : null,
  filer: d.user
    ? {
        id: d.user.id,
        role: d.user.role,
        nameAr: d.user.nameAr,
        nameEn: d.user.nameEn,
        email: d.user.email,
        phone: d.user.phone,
      }
    : null,
  booking: d.booking
    ? {
        id: d.booking.id,
        status: d.booking.status,
        serviceId: d.booking.serviceId,
      }
    : null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const listDisputes = async ({ page, limit, status, filerRole, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(status && { status }),
    ...(filerRole && { user: { role: filerRole } }),
    ...(q && {
      OR: [
        { subject: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.dispute.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: { id: true, role: true, nameAr: true, nameEn: true, email: true, phone: true },
        },
        respondedByAdmin: { select: { id: true, nameAr: true, nameEn: true } },
        booking: { select: { id: true, status: true, serviceId: true } },
      },
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

const getDispute = async (disputeId) => {
  const d = await prisma.dispute.findFirst({
    where: { id: disputeId, deletedAt: null },
    include: {
      user: {
        select: { id: true, role: true, nameAr: true, nameEn: true, email: true, phone: true },
      },
      respondedByAdmin: { select: { id: true, nameAr: true, nameEn: true } },
      booking: { select: { id: true, status: true, serviceId: true } },
    },
  });
  if (!d) throw ApiError.notFound('Dispute not found');
  return serializeDispute(d);
};

/**
 * Update a dispute: change status, write a response, or both.
 *
 * Side effects when a response is added (i.e. `adminResponse` differs
 * from the existing value):
 *   - `respondedByAdminId` is stamped with the calling admin.
 *   - `respondedAt` is set to NOW.
 *   - The filer gets a DISPUTE_RESPONDED notification.
 *
 * No formal state-machine enforcement: any transition is allowed
 * because admins occasionally need to "undo" (RESOLVED → IN_REVIEW)
 * when new info surfaces. The audit trail (respondedAt / updatedAt)
 * still tells the story.
 */
const updateDispute = async (disputeId, adminId, body) => {
  const existing = await prisma.dispute.findFirst({
    where: { id: disputeId, deletedAt: null },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!existing) throw ApiError.notFound('Dispute not found');

  const data = {};
  if (body.status !== undefined) data.status = body.status;

  const isNewResponse =
    body.adminResponse !== undefined &&
    body.adminResponse !== existing.adminResponse &&
    body.adminResponse !== '';

  if (body.adminResponse !== undefined) {
    data.adminResponse = body.adminResponse || null;
  }
  if (isNewResponse) {
    data.respondedByAdminId = adminId;
    data.respondedAt = new Date();
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data,
    include: {
      user: {
        select: { id: true, role: true, nameAr: true, nameEn: true, email: true, phone: true },
      },
      respondedByAdmin: { select: { id: true, nameAr: true, nameEn: true } },
      booking: { select: { id: true, status: true, serviceId: true } },
    },
  });

  logger.info(
    { disputeId, adminId, statusChanged: body.status !== undefined, responded: isNewResponse },
    'Dispute updated by admin',
  );

  // Best-effort filer notification — only fires when the admin
  // actually wrote a response (status-only changes stay silent so
  // the user isn't pinged for internal admin triage).
  if (isNewResponse) {
    notify({
      userId: existing.userId,
      type: 'DISPUTE_RESPONDED',
      titleAr: 'تم الرد على شكواك',
      titleEn: 'Your complaint has been answered',
      bodyAr: existing.subject,
      bodyEn: existing.subject,
      data: { disputeId: existing.id },
    });
  }

  return serializeDispute(updated);
};

module.exports = { listDisputes, getDispute, updateDispute };

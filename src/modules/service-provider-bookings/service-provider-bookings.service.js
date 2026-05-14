const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Service Provider booking flow — FRD §2.2 + §2.3.
 *
 * Eligibility to act:
 *   - SP user must be ENABLED (enforced by /auth/mobile/login + status
 *     check) AND verified (isVerified === true).
 *   - On `accept` we re-check verification at the service layer so a
 *     fresh JWT issued before KYC rejection can't be used to grab a
 *     booking after the SP is unverified.
 *
 * Atomic accept (race condition):
 *   Two SPs could try to accept the same PENDING booking simultaneously.
 *   We use a conditional update — `where: { id, status: 'PENDING' }` —
 *   so Postgres lets exactly one transaction win. The loser gets a
 *   409 conflict on the next .findFirst attempt.
 *
 * Commission lock at APPROVED:
 *   We snapshot Service.commissionRate at this moment and compute
 *   commissionAmount = totalCost * rate / 100. Admin changing the
 *   rate later does not retroactively affect this booking.
 */

// Money fields always serialise to fixed 2-decimal strings. Same
// rationale as customer-bookings.service: Prisma Decimal drops
// trailing zeros and the client shouldn't have to renormalise.
const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const serialize = (b) => ({
  id: b.id,
  serviceId: b.serviceId,
  service: b.service
    ? {
        id: b.service.id,
        titleAr: b.service.titleAr,
        titleEn: b.service.titleEn,
        imageUrl: b.service.imageUrl,
      }
    : undefined,
  customer: b.customer
    ? {
        id: b.customer.id,
        nameAr: b.customer.nameAr,
        nameEn: b.customer.nameEn,
        phone: b.customer.phone,
      }
    : null,
  assignedSpId: b.assignedSpId,
  description: b.description,
  locationLat: b.locationLat ? b.locationLat.toString() : null,
  locationLng: b.locationLng ? b.locationLng.toString() : null,
  locationAddress: b.locationAddress,
  scheduledDate: b.scheduledDate,
  totalCost: money(b.totalCost),
  commissionRate: b.commissionRate ? b.commissionRate.toString() : null,
  commissionAmount: money(b.commissionAmount),
  spPayout: b.commissionAmount
    ? money(Number(b.totalCost) - Number(b.commissionAmount))
    : null,
  status: b.status,
  paymentMethod: b.paymentMethod,
  paymentStatus: b.paymentStatus,
  approvedAt: b.approvedAt,
  startedAt: b.startedAt,
  completedAt: b.completedAt,
  subcategories: (b.selectedSubcategories || []).map((s) => ({
    id: s.id,
    titleAr: s.titleAr,
    titleEn: s.titleEn,
    cost: money(s.cost),
  })),
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const requireVerifiedSp = async (userId) => {
  const sp = await prisma.serviceProvider.findFirst({
    where: { userId, deletedAt: null },
  });
  if (!sp) {
    throw ApiError.notFound('Service provider profile not found');
  }
  if (!sp.isVerified) {
    throw ApiError.forbidden(
      'Only verified service providers can act on bookings. Submit KYC and await admin approval.',
    );
  }
};

/**
 * Open pool: every PENDING booking is fair game for any verified SP.
 * Filtering by serviceId lets an SP focus on their specialty.
 */
const listPool = async (spUserId, { page, limit, serviceId, sort }) => {
  await requireVerifiedSp(spUserId);

  const skip = (page - 1) * limit;
  const where = {
    status: 'PENDING',
    assignedSpId: null,
    ...(serviceId && { serviceId }),
  };

  const orderBy = sort === 'newestFirst' ? { createdAt: 'desc' } : { createdAt: 'asc' };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        service: true,
        customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.booking.count({ where }),
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

const acceptBooking = async (spUserId, bookingId) => {
  await requireVerifiedSp(spUserId);

  // Race-safe accept: only one transaction can flip a PENDING row.
  // updateMany returns count; if 0, someone else won OR the row isn't
  // PENDING any more. We then re-read to give a precise error.
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.booking.findFirst({
      where: { id: bookingId },
      include: { service: true },
    });
    if (!target) {
      throw ApiError.notFound('Booking not found');
    }
    if (target.status !== 'PENDING') {
      throw ApiError.conflict(`Booking is no longer available (status: ${target.status})`);
    }

    // Lock commission at this exact moment.
    const rate = Number(target.service.commissionRate);
    const amount = ((Number(target.totalCost) * rate) / 100).toFixed(2);

    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: 'PENDING', assignedSpId: null },
      data: {
        assignedSpId: spUserId,
        status: 'APPROVED',
        approvedAt: new Date(),
        commissionRate: rate,
        commissionAmount: amount,
      },
    });
    if (updated.count === 0) {
      // Someone else won the race after our findFirst above.
      throw ApiError.conflict('Booking was just taken by another provider');
    }

    return tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  logger.info({ bookingId, spUserId }, 'Booking accepted (PENDING → APPROVED)');
  return serialize(result);
};

const assignedOrFail = async (spUserId, bookingId) => {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, assignedSpId: spUserId },
    include: {
      service: true,
      customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!b) {
    throw ApiError.notFound('Booking not found');
  }
  return b;
};

const listMine = async (spUserId, { page, limit, status, sort }) => {
  await requireVerifiedSp(spUserId);

  const skip = (page - 1) * limit;
  const where = {
    assignedSpId: spUserId,
    ...(status && { status }),
  };
  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        service: true,
        customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.booking.count({ where }),
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

const getOne = async (spUserId, bookingId) => serialize(await assignedOrFail(spUserId, bookingId));

const startBooking = async (spUserId, bookingId) => {
  await requireVerifiedSp(spUserId);
  const b = await assignedOrFail(spUserId, bookingId);
  if (b.status !== 'APPROVED') {
    throw ApiError.conflict(
      `Cannot start a booking that is ${b.status}; only APPROVED bookings can be started`,
    );
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
    include: {
      service: true,
      customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });
  logger.info({ bookingId, spUserId }, 'Booking started (APPROVED → IN_PROGRESS)');
  return serialize(updated);
};

const completeBooking = async (spUserId, bookingId) => {
  await requireVerifiedSp(spUserId);
  const b = await assignedOrFail(spUserId, bookingId);
  if (b.status !== 'IN_PROGRESS') {
    throw ApiError.conflict(
      `Cannot complete a booking that is ${b.status}; only IN_PROGRESS bookings can be completed`,
    );
  }

  // For CASH bookings, completion = payment received (Sprint 4 WALLET/
  // ONLINE flows will mark PAID at charge time instead).
  const isPaidNow = b.paymentMethod === 'CASH';

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ...(isPaidNow && { paymentStatus: 'PAID' }),
    },
    include: {
      service: true,
      customer: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });
  logger.info(
    { bookingId, spUserId, paymentStatus: updated.paymentStatus },
    'Booking completed (IN_PROGRESS → COMPLETED)',
  );
  return serialize(updated);
};

module.exports = {
  listPool,
  acceptBooking,
  listMine,
  getOne,
  startBooking,
  completeBooking,
};

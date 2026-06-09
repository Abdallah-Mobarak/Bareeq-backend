const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const walletService = require('../../services/wallet.service');
const { notify } = require('../notifications/notifications.service');

/**
 * Customer-side booking flow — FRD §1.3.
 *
 * MVP restrictions:
 *   - paymentMethod = CASH | WALLET supported. ONLINE (PayTabs) lands
 *     with Sprint 4+ external-payment integration.
 *   - Cancel allowed ONLY while PENDING (after an SP accepts, the
 *     SP has started scheduling — we don't unilaterally cancel).
 *
 * WALLET semantics (commits before the SP is even known):
 *   - On CREATE: validate balance >= totalCost; insert booking +
 *     BOOKING_DEBIT in the same transaction. The customer's wallet
 *     is locked immediately so they can't double-spend the same
 *     funds across multiple PENDING bookings.
 *   - On CANCEL of a WALLET booking: REFUND back to the customer in
 *     the same transaction. PENDING-only cancellation guarantees the
 *     SP never started work for that money.
 *   - On COMPLETE (handled in service-provider-bookings): credit the
 *     SP (BOOKING_CREDIT for totalCost) and immediately debit the
 *     platform commission (COMMISSION_DEBIT) — net = SP earnings.
 */

// Money fields always serialise to fixed 2-decimal strings. Prisma's
// Decimal.toString() drops trailing zeros (300, not 300.00) which the
// mobile client has to renormalise — better to do it once at the edge.
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
  customerId: b.customerId,
  assignedSpId: b.assignedSpId,
  assignedSp: b.assignedSp
    ? {
        id: b.assignedSp.id,
        nameAr: b.assignedSp.nameAr,
        nameEn: b.assignedSp.nameEn,
        phone: b.assignedSp.phone,
      }
    : null,
  description: b.description,
  locationLat: b.locationLat ? b.locationLat.toString() : null,
  locationLng: b.locationLng ? b.locationLng.toString() : null,
  locationAddress: b.locationAddress,
  scheduledDate: b.scheduledDate,
  totalCost: money(b.totalCost),
  commissionRate: b.commissionRate ? b.commissionRate.toString() : null,
  commissionAmount: money(b.commissionAmount),
  status: b.status,
  paymentMethod: b.paymentMethod,
  paymentStatus: b.paymentStatus,
  approvedAt: b.approvedAt,
  startedAt: b.startedAt,
  completedAt: b.completedAt,
  cancelledAt: b.cancelledAt,
  cancellationReason: b.cancellationReason,
  subcategories: (b.selectedSubcategories || []).map((s) => ({
    id: s.id,
    subcategoryId: s.subcategoryId,
    titleAr: s.titleAr,
    titleEn: s.titleEn,
    cost: money(s.cost),
  })),
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const createBooking = async (customerId, data) => {
  // ONLINE / PayTabs lands in a separate sprint — block it cleanly.
  if (data.paymentMethod === 'ONLINE') {
    throw ApiError.badRequest('Online payment is not yet available. Use CASH or WALLET.');
  }

  // Validate service exists, is active, and load its commissionRate
  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, deletedAt: null, isActive: true },
  });
  if (!service) {
    throw ApiError.badRequest('Service not found or unavailable');
  }

  // Load each subcategory the customer picked, ensure all belong to
  // this service and none are deleted. One query, then verify.
  const subs = await prisma.serviceSubcategory.findMany({
    where: { id: { in: data.subcategoryIds }, deletedAt: null },
  });
  if (subs.length !== data.subcategoryIds.length) {
    throw ApiError.badRequest('One or more selected subcategories are unavailable');
  }
  if (subs.some((s) => s.serviceId !== service.id)) {
    throw ApiError.badRequest('All selected subcategories must belong to the chosen service');
  }

  const totalCost = subs.reduce((acc, s) => acc + Number(s.cost), 0).toFixed(2);

  const created = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        customerId,
        serviceId: service.id,
        description: data.description || null,
        locationLat: data.locationLat ?? null,
        locationLng: data.locationLng ?? null,
        locationAddress: data.locationAddress || null,
        scheduledDate: new Date(data.scheduledDate),
        totalCost,
        paymentMethod: data.paymentMethod,
        // WALLET bookings flip to PAID immediately (the customer's wallet
        // is being debited inside this same transaction). CASH stays
        // PENDING until the SP completes + collects cash.
        ...(data.paymentMethod === 'WALLET' && { paymentStatus: 'PAID' }),
      },
    });
    await tx.bookingSubcategory.createMany({
      data: subs.map((s) => ({
        bookingId: booking.id,
        subcategoryId: s.id,
        titleAr: s.titleAr,
        titleEn: s.titleEn,
        cost: s.cost,
      })),
    });

    // For WALLET bookings, debit the customer NOW. If they're broke,
    // applyTransaction throws 400 "Insufficient wallet balance" and
    // the whole transaction (booking + subcategories) rolls back.
    if (data.paymentMethod === 'WALLET') {
      await walletService.applyTransaction(tx, {
        userId: customerId,
        type: 'BOOKING_DEBIT',
        amount: totalCost,
        bookingId: booking.id,
        note: `Payment for booking ${booking.id.slice(0, 8)}`,
      });
    }

    return tx.booking.findUnique({
      where: { id: booking.id },
      include: {
        service: true,
        assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  logger.info(
    { bookingId: created.id, customerId, totalCost, paymentMethod: data.paymentMethod },
    'Booking created (PENDING)',
  );

  // Fan-out "New request for your service type" to every enabled+verified
  // SP registered for this service's category (FRD §2.4). Best-effort: the
  // booking is already committed, so a notification hiccup must not 500 it.
  try {
    const matchingSps = await prisma.serviceProvider.findMany({
      where: {
        serviceCategoryId: service.categoryId,
        isVerified: true,
        deletedAt: null,
        user: { status: 'ENABLED', deletedAt: null },
      },
      select: { userId: true },
    });
    await Promise.all(
      matchingSps.map((sp) =>
        notify({
          userId: sp.userId,
          type: 'NEW_BOOKING_REQUEST',
          titleAr: 'طلب خدمة جديد',
          titleEn: 'New service request',
          bodyAr: `وصل طلب جديد لخدمة "${created.service.titleAr}" يطابق تخصصك.`,
          bodyEn: `A new "${created.service.titleEn || created.service.titleAr}" request matching your service type is available.`,
          data: { bookingId: created.id, serviceId: created.serviceId },
        }),
      ),
    );
  } catch (err) {
    logger.error(
      { err, bookingId: created.id },
      'Failed to fan-out NEW_BOOKING_REQUEST notifications',
    );
  }

  return serialize(created);
};

const listMine = async (customerId, { page, limit, status, sort }) => {
  const skip = (page - 1) * limit;
  const where = { customerId, ...(status && { status }) };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        service: true,
        assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
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

const ownedOrFail = async (customerId, bookingId) => {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: {
      service: true,
      assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });
  // 404 instead of 403 — object-capability style: don't leak existence
  // of someone else's booking.
  if (!b) {
    throw ApiError.notFound('Booking not found');
  }
  return b;
};

const getMine = async (customerId, bookingId) =>
  serialize(await ownedOrFail(customerId, bookingId));

const cancelMine = async (customerId, bookingId, { reason }) => {
  const b = await ownedOrFail(customerId, bookingId);
  if (b.status !== 'PENDING') {
    throw ApiError.conflict(
      `Cannot cancel a booking that is ${b.status}; only PENDING bookings can be cancelled by the customer`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
        // WALLET bookings flip back to REFUNDED so the ledger story
        // is consistent ("paid → refunded"). CASH bookings never
        // moved money, so paymentStatus stays PENDING.
        ...(b.paymentMethod === 'WALLET' && { paymentStatus: 'REFUNDED' }),
      },
    });

    // Refund the customer's wallet for WALLET bookings. Same
    // transaction so cancel + refund commit together or not at all.
    if (b.paymentMethod === 'WALLET') {
      await walletService.applyTransaction(tx, {
        userId: customerId,
        type: 'REFUND',
        amount: b.totalCost,
        bookingId: row.id,
        note: `Refund for cancelled booking ${row.id.slice(0, 8)}`,
      });
    }

    return tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  logger.info(
    { bookingId, customerId, reason, paymentMethod: b.paymentMethod },
    'Booking cancelled by customer',
  );

  // FRD §1.4: confirm the cancellation and, for WALLET bookings, the
  // wallet refund. Best-effort — the cancellation is already committed.
  try {
    await notify({
      userId: customerId,
      type: 'BOOKING_CANCELLED',
      titleAr: 'تم إلغاء الطلب',
      titleEn: 'Request cancelled',
      bodyAr: `تم إلغاء طلب "${updated.service.titleAr}".`,
      bodyEn: `Your "${updated.service.titleEn || updated.service.titleAr}" request was cancelled.`,
      data: { bookingId, serviceId: updated.serviceId },
    });
    if (b.paymentMethod === 'WALLET') {
      await notify({
        userId: customerId,
        type: 'REFUND_ISSUED',
        titleAr: 'تم رد المبلغ لمحفظتك',
        titleEn: 'Refund issued to your wallet',
        bodyAr: `تم رد ${Number(b.totalCost).toFixed(2)} ريال إلى محفظتك بعد الإلغاء.`,
        bodyEn: `${Number(b.totalCost).toFixed(2)} SAR has been refunded to your wallet after cancellation.`,
        data: { bookingId, amount: Number(b.totalCost).toFixed(2) },
      });
    }
  } catch (err) {
    logger.error({ err, bookingId }, 'Failed to send cancellation notifications');
  }

  return serialize(updated);
};

module.exports = { createBooking, listMine, getMine, cancelMine };

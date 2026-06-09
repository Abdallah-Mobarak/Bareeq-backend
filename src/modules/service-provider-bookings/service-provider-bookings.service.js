const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');
const walletService = require('../../services/wallet.service');

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
  spPayout: b.commissionAmount ? money(Number(b.totalCost) - Number(b.commissionAmount)) : null,
  status: b.status,
  paymentMethod: b.paymentMethod,
  paymentStatus: b.paymentStatus,
  approvedAt: b.approvedAt,
  startedAt: b.startedAt,
  completedAt: b.completedAt,
  cashReceivedAt: b.cashReceivedAt,
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
  return sp;
};

/**
 * Build the pool `where` for a given SP. PENDING + unassigned, scoped to
 * the SP's registered service type (FRD §2.1/§2.2 — "requests that match
 * the service type they are registered for"), and excluding any booking
 * the SP already rejected (BookingDismissal). When the SP has no service
 * type yet (legacy rows), we don't category-filter so they still see work.
 */
const poolWhereFor = (sp, spUserId, serviceId) => ({
  status: 'PENDING',
  assignedSpId: null,
  ...(serviceId && { serviceId }),
  ...(sp.serviceCategoryId && { service: { categoryId: sp.serviceCategoryId } }),
  dismissals: { none: { spId: spUserId } },
});

/**
 * Open pool: every PENDING booking matching the SP's service type is fair
 * game, minus the ones this SP rejected. Filtering by serviceId lets an SP
 * focus on a specific service within their type.
 */
const listPool = async (spUserId, { page, limit, serviceId, sort }) => {
  const sp = await requireVerifiedSp(spUserId);

  const skip = (page - 1) * limit;
  const where = poolWhereFor(sp, spUserId, serviceId);

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

  // Tell the customer that an SP took their request.
  await notify({
    userId: result.customerId,
    type: 'BOOKING_ACCEPTED',
    titleAr: 'تم قبول طلبك',
    titleEn: 'Your booking has been accepted',
    bodyAr: `قَبِل مزود الخدمة طلب "${result.service.titleAr}". انتظر بدء التنفيذ.`,
    bodyEn: `A provider accepted your "${result.service.titleEn || result.service.titleAr}" request.`,
    data: { bookingId, serviceId: result.serviceId },
  });

  return serialize(result);
};

/**
 * SP rejects a pending request (FRD §2.2.2). In the open-pool model this
 * is a per-SP dismissal: we record a BookingDismissal so the booking
 * vanishes from THIS SP's pool but stays PENDING for everyone else.
 * Idempotent — rejecting twice is a no-op thanks to the unique constraint.
 */
const rejectBooking = async (spUserId, bookingId) => {
  await requireVerifiedSp(spUserId);

  const booking = await prisma.booking.findFirst({ where: { id: bookingId } });
  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }
  if (booking.status !== 'PENDING' || booking.assignedSpId) {
    throw ApiError.conflict('Only pending, unassigned requests can be rejected');
  }

  await prisma.bookingDismissal.upsert({
    where: { bookingId_spId: { bookingId, spId: spUserId } },
    create: { bookingId, spId: spUserId },
    update: {},
  });

  logger.info({ bookingId, spUserId }, 'SP dismissed pending booking (per-SP reject)');
  return { bookingId, dismissed: true };
};

/**
 * Dashboard counters (FRD §2.2.1). Scoped to THIS SP:
 *   pending  — open-pool requests waiting for them (matching service type,
 *              not yet rejected)
 *   approved — requests they took (assigned to them, still active/done)
 *   rejected — requests they dismissed
 */
const getDashboardStats = async (spUserId) => {
  const sp = await requireVerifiedSp(spUserId);

  const [pending, approved, rejected] = await prisma.$transaction([
    prisma.booking.count({ where: poolWhereFor(sp, spUserId) }),
    prisma.booking.count({
      where: {
        assignedSpId: spUserId,
        status: { in: ['APPROVED', 'IN_PROGRESS', 'COMPLETED'] },
      },
    }),
    prisma.bookingDismissal.count({ where: { spId: spUserId } }),
  ]);

  return { pending, approved, rejected };
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

  await notify({
    userId: updated.customerId,
    type: 'BOOKING_STARTED',
    titleAr: 'بدأ تنفيذ طلبك',
    titleEn: 'Your booking has started',
    bodyAr: `بدأ المزود تنفيذ "${updated.service.titleAr}".`,
    bodyEn: `Work has started on "${updated.service.titleEn || updated.service.titleAr}".`,
    data: { bookingId, serviceId: updated.serviceId },
  });

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

  // CASH bookings: completion = work done (Implemented). Payment is NOT
  // marked PAID here — the SP confirms it separately via "Amount Received"
  // (FRD §2.3.1.1), which sets paymentStatus + cashReceivedAt.
  // WALLET bookings: customer was already debited at create-time
  // (paymentStatus is already PAID) → we now credit the SP + debit
  // commission from the same wallet.
  const isWallet = b.paymentMethod === 'WALLET';

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // For WALLET bookings, settle the SP earnings + platform commission
    // atomically with the completion. We credit gross then debit
    // commission so the SP's ledger shows the full picture:
    //   "Earned 500", "Commission 50 (10%)" → net 450 in wallet.
    if (isWallet) {
      await walletService.applyTransaction(tx, {
        userId: spUserId,
        type: 'BOOKING_CREDIT',
        amount: row.totalCost,
        bookingId,
        note: `Earnings (gross) from booking ${bookingId.slice(0, 8)}`,
      });
      if (row.commissionAmount && Number(row.commissionAmount) > 0) {
        await walletService.applyTransaction(tx, {
          userId: spUserId,
          type: 'COMMISSION_DEBIT',
          amount: row.commissionAmount,
          bookingId,
          note: `Platform commission ${row.commissionRate}% on booking ${bookingId.slice(0, 8)}`,
        });
      }
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
  logger.info(
    { bookingId, spUserId, paymentMethod: b.paymentMethod, paymentStatus: updated.paymentStatus },
    'Booking completed (IN_PROGRESS → COMPLETED)',
  );

  // Prompt the customer to leave a review — closes the booking loop.
  await notify({
    userId: updated.customerId,
    type: 'BOOKING_COMPLETED',
    titleAr: 'تم إنجاز الخدمة',
    titleEn: 'Service completed',
    bodyAr: `تم إنجاز "${updated.service.titleAr}". قيّم تجربتك من فضلك.`,
    bodyEn: `"${updated.service.titleEn || updated.service.titleAr}" is complete. Please rate your experience.`,
    data: { bookingId, serviceId: updated.serviceId },
  });

  return serialize(updated);
};

/**
 * "Amount Received" — the SP confirms they collected the cash for a CASH
 * booking (FRD §2.3.1.1). Only valid once the work is COMPLETED. Sets
 * paymentStatus = PAID + cashReceivedAt and notifies the customer.
 * No-op-safe: confirming twice throws a clear conflict.
 */
const confirmCashReceived = async (spUserId, bookingId) => {
  await requireVerifiedSp(spUserId);
  const b = await assignedOrFail(spUserId, bookingId);

  if (b.paymentMethod !== 'CASH') {
    throw ApiError.conflict('Amount Received only applies to cash bookings');
  }
  if (b.status !== 'COMPLETED') {
    throw ApiError.conflict(
      `Cannot confirm payment for a ${b.status} booking; complete the visit first`,
    );
  }
  if (b.paymentStatus === 'PAID' || b.cashReceivedAt) {
    throw ApiError.conflict('Cash receipt is already confirmed for this booking');
  }

  // The SP holds the cash, so the platform's commission is clawed back
  // from their wallet here (FRD §2.1 "cash → commission deducted from the
  // provider's balance"). This may push the SP wallet negative — that's
  // the intended "commission owed" debt the SP later tops up.
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: 'PAID', cashReceivedAt: new Date() },
    });

    if (row.commissionAmount && Number(row.commissionAmount) > 0) {
      await walletService.applyTransaction(tx, {
        userId: spUserId,
        type: 'COMMISSION_DEBIT',
        amount: row.commissionAmount,
        bookingId,
        note: `Platform commission ${row.commissionRate}% on cash booking ${bookingId.slice(0, 8)}`,
      });
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
  logger.info(
    { bookingId, spUserId },
    'Cash receipt confirmed (Amount Received) + commission debited',
  );

  await notify({
    userId: updated.customerId,
    type: 'BOOKING_COMPLETED',
    titleAr: 'تم تأكيد استلام المبلغ',
    titleEn: 'Cash payment confirmed',
    bodyAr: `أكد المزود استلام مبلغ خدمة "${updated.service.titleAr}".`,
    bodyEn: `The provider confirmed the cash payment for "${updated.service.titleEn || updated.service.titleAr}".`,
    data: { bookingId, serviceId: updated.serviceId },
  });

  return serialize(updated);
};

module.exports = {
  listPool,
  acceptBooking,
  rejectBooking,
  getDashboardStats,
  listMine,
  getOne,
  startBooking,
  completeBooking,
  confirmCashReceived,
};

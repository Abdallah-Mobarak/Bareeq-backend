const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Customer-side booking flow — FRD §1.3.
 *
 * MVP restrictions:
 *   - paymentMethod = CASH only (WALLET + ONLINE arrive with Sprint 4
 *     payment integration). We let the request type WALLET/ONLINE
 *     parse cleanly but reject it at the service boundary so the
 *     mistake is obvious.
 *   - Cancel allowed ONLY while PENDING (after an SP accepts, the
 *     SP has started scheduling — we don't unilaterally cancel).
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
  // MVP gate: only CASH is wired
  if (data.paymentMethod !== 'CASH') {
    throw ApiError.badRequest(
      'Only CASH payment is supported in this release; WALLET and ONLINE arrive with the payment integration',
    );
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
    return tx.booking.findUnique({
      where: { id: booking.id },
      include: {
        service: true,
        assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
        selectedSubcategories: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  logger.info({ bookingId: created.id, customerId, totalCost }, 'Booking created (PENDING)');
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

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
    include: {
      service: true,
      assignedSp: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });

  logger.info({ bookingId, customerId, reason }, 'Booking cancelled by customer');
  return serialize(updated);
};

module.exports = { createBooking, listMine, getMine, cancelMine };

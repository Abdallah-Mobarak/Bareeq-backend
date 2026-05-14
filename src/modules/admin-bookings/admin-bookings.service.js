const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Admin oversight of bookings (FRD §3.3).
 *
 * Read-only for now. Sprint 4 will add the dispute/refund flow that
 * lets admins force-cancel or refund — that needs its own dedicated
 * endpoint with audit trail.
 */

const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const serialize = (b) => ({
  id: b.id,
  status: b.status,
  paymentMethod: b.paymentMethod,
  paymentStatus: b.paymentStatus,
  totalCost: money(b.totalCost),
  commissionRate: b.commissionRate ? b.commissionRate.toString() : null,
  commissionAmount: money(b.commissionAmount),
  service: b.service
    ? {
        id: b.service.id,
        titleAr: b.service.titleAr,
        titleEn: b.service.titleEn,
      }
    : null,
  customer: b.customer
    ? {
        id: b.customer.id,
        email: b.customer.email,
        nameAr: b.customer.nameAr,
        nameEn: b.customer.nameEn,
        phone: b.customer.phone,
      }
    : null,
  assignedSp: b.assignedSp
    ? {
        id: b.assignedSp.id,
        email: b.assignedSp.email,
        nameAr: b.assignedSp.nameAr,
        nameEn: b.assignedSp.nameEn,
      }
    : null,
  description: b.description,
  locationAddress: b.locationAddress,
  scheduledDate: b.scheduledDate,
  approvedAt: b.approvedAt,
  startedAt: b.startedAt,
  completedAt: b.completedAt,
  cancelledAt: b.cancelledAt,
  cancellationReason: b.cancellationReason,
  subcategories: (b.selectedSubcategories || []).map((s) => ({
    id: s.id,
    titleAr: s.titleAr,
    titleEn: s.titleEn,
    cost: money(s.cost),
  })),
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const list = async ({
  page,
  limit,
  status,
  serviceId,
  customerId,
  assignedSpId,
  paymentMethod,
  paymentStatus,
  sort,
}) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status && { status }),
    ...(serviceId && { serviceId }),
    ...(customerId && { customerId }),
    ...(assignedSpId && { assignedSpId }),
    ...(paymentMethod && { paymentMethod }),
    ...(paymentStatus && { paymentStatus }),
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
        customer: {
          select: {
            id: true,
            email: true,
            nameAr: true,
            nameEn: true,
            phone: true,
          },
        },
        assignedSp: {
          select: {
            id: true,
            email: true,
            nameAr: true,
            nameEn: true,
          },
        },
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

const getOne = async (id) => {
  const b = await prisma.booking.findFirst({
    where: { id },
    include: {
      service: true,
      customer: {
        select: { id: true, email: true, nameAr: true, nameEn: true, phone: true },
      },
      assignedSp: {
        select: { id: true, email: true, nameAr: true, nameEn: true },
      },
      selectedSubcategories: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!b) {
    throw ApiError.notFound('Booking not found');
  }
  return serialize(b);
};

module.exports = { list, getOne };

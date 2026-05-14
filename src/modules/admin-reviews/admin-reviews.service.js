const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Admin oversight of reviews — read-only. The dispute / takedown flow
 * (admin hides or deletes a review) lands with the wider disputes
 * module in Sprint 4+.
 */

const sortMap = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  ratingHigh: [{ rating: 'desc' }, { createdAt: 'desc' }],
  ratingLow: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

const serialize = (r) => ({
  id: r.id,
  bookingId: r.bookingId,
  rating: r.rating,
  comment: r.comment,
  customer: {
    id: r.customer.id,
    email: r.customer.email,
    nameAr: r.customer.nameAr,
    nameEn: r.customer.nameEn,
  },
  serviceProvider: {
    id: r.serviceProvider.id,
    email: r.serviceProvider.email,
    nameAr: r.serviceProvider.nameAr,
    nameEn: r.serviceProvider.nameEn,
  },
  service: {
    id: r.service.id,
    titleAr: r.service.titleAr,
    titleEn: r.service.titleEn,
  },
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const list = async ({
  page,
  limit,
  serviceId,
  serviceProviderId,
  customerId,
  minRating,
  maxRating,
  sort,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(serviceId && { serviceId }),
    ...(serviceProviderId && { serviceProviderId }),
    ...(customerId && { customerId }),
    ...((minRating !== undefined || maxRating !== undefined) && {
      rating: {
        ...(minRating !== undefined && { gte: minRating }),
        ...(maxRating !== undefined && { lte: maxRating }),
      },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortMap[sort] || sortMap.newest,
      include: {
        customer: { select: { id: true, email: true, nameAr: true, nameEn: true } },
        serviceProvider: {
          select: { id: true, email: true, nameAr: true, nameEn: true },
        },
        service: { select: { id: true, titleAr: true, titleEn: true } },
      },
    }),
    prisma.review.count({ where }),
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
  const r = await prisma.review.findFirst({
    where: { id },
    include: {
      customer: { select: { id: true, email: true, nameAr: true, nameEn: true } },
      serviceProvider: { select: { id: true, email: true, nameAr: true, nameEn: true } },
      service: { select: { id: true, titleAr: true, titleEn: true } },
    },
  });
  if (!r) {
    throw ApiError.notFound('Review not found');
  }
  return serialize(r);
};

module.exports = { list, getOne };

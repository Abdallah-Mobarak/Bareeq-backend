const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Reviews received by the authenticated SP — FRD §2 (SP profile rating).
 *
 * The SP sees reviews ABOUT them (filtered by Review.serviceProviderId).
 * Each row carries the customer's display name + the booked service so
 * the SP knows which job the review is for.
 *
 * No auth-side `requireVerifiedSp` here: an unverified SP can't have
 * earned a review yet (you have to accept a booking to be reviewed),
 * so the list will simply be empty. No need to 403 them out.
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
    nameAr: r.customer.nameAr,
    nameEn: r.customer.nameEn,
  },
  service: {
    id: r.service.id,
    titleAr: r.service.titleAr,
    titleEn: r.service.titleEn,
  },
  createdAt: r.createdAt,
});

const listMyReviews = async (spUserId, { page, limit, minRating, maxRating, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    serviceProviderId: spUserId,
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
        customer: { select: { id: true, nameAr: true, nameEn: true } },
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

module.exports = { listMyReviews };

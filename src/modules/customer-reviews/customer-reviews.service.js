const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');

/**
 * Customer-side review flow — FRD §1.2.1 / §1.2.2.
 *
 * Rules enforced here:
 *   - Booking must belong to the calling customer (object-capability:
 *     404 on someone else's booking, not 403).
 *   - Booking must be COMPLETED — earlier statuses can't be reviewed.
 *   - One review per booking — second attempt = 409 conflict.
 *
 * Aggregation:
 *   After the review row is created, we recompute ratingAverage and
 *   ratingCount on BOTH the Service and the ServiceProvider inside the
 *   same transaction. This keeps Customer Home and SP profile pages
 *   fast (no AVG() at read time) and guarantees the two aggregates
 *   move atomically with the review.
 */

const serialize = (r, { includeCustomer = false } = {}) => ({
  id: r.id,
  bookingId: r.bookingId,
  serviceId: r.serviceId,
  serviceProviderId: r.serviceProviderId,
  rating: r.rating,
  comment: r.comment,
  customer:
    includeCustomer && r.customer
      ? {
          id: r.customer.id,
          nameAr: r.customer.nameAr,
          nameEn: r.customer.nameEn,
        }
      : undefined,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/**
 * Recompute ratingAverage + ratingCount for a Service AND a
 * ServiceProvider, atomically. Called inside the same transaction as
 * the Review insert. Uses Prisma's aggregate to compute fresh values
 * — simpler and less error-prone than incremental updates.
 */
const recomputeAggregates = async (tx, { serviceId, serviceProviderId }) => {
  const [svcAgg, spAgg] = await Promise.all([
    tx.review.aggregate({
      where: { serviceId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    tx.review.aggregate({
      where: { serviceProviderId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  await tx.service.update({
    where: { id: serviceId },
    data: {
      ratingAverage: svcAgg._avg.rating ? Number(svcAgg._avg.rating).toFixed(2) : null,
      ratingCount: svcAgg._count._all,
    },
  });

  await tx.serviceProvider.update({
    where: { userId: serviceProviderId },
    data: {
      ratingAverage: spAgg._avg.rating ? Number(spAgg._avg.rating).toFixed(2) : null,
      ratingCount: spAgg._count._all,
    },
  });
};

const submitReview = async (customerId, bookingId, { rating, comment }) => {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
  });
  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }
  if (booking.status !== 'COMPLETED') {
    throw ApiError.conflict(
      `Cannot review a booking that is ${booking.status}; only COMPLETED bookings can be reviewed`,
    );
  }
  if (!booking.assignedSpId) {
    // Defence-in-depth — a COMPLETED booking must have an assigned SP.
    // If this triggers it's a data-integrity bug, not a user error.
    throw ApiError.internal('COMPLETED booking has no assigned SP');
  }

  const existing = await prisma.review.findUnique({
    where: { bookingId },
  });
  if (existing) {
    throw ApiError.conflict('This booking has already been reviewed');
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        bookingId,
        customerId,
        serviceProviderId: booking.assignedSpId,
        serviceId: booking.serviceId,
        rating,
        comment: comment || null,
      },
    });

    await recomputeAggregates(tx, {
      serviceId: booking.serviceId,
      serviceProviderId: booking.assignedSpId,
    });

    return created;
  });

  logger.info(
    { reviewId: review.id, bookingId, customerId, rating },
    'Customer review submitted; aggregates recomputed',
  );

  // Tell the SP they received a review. We deliberately don't include
  // the comment in the body — keep the notification short; the client
  // opens the SP-reviews screen via data.reviewId.
  await notify({
    userId: booking.assignedSpId,
    type: 'REVIEW_RECEIVED',
    titleAr: 'تقييم جديد',
    titleEn: 'New review',
    bodyAr: `حصلت على تقييم ${rating} نجوم على إحدى خدماتك.`,
    bodyEn: `You received a ${rating}-star review on one of your services.`,
    data: { reviewId: review.id, bookingId, rating },
  });

  return serialize(review);
};

const getMyReview = async (customerId, bookingId) => {
  // Confirm the booking belongs to this customer before exposing the
  // review (even though Review.customerId would also work, going via
  // booking keeps the API surface uniform with the cancel/detail
  // endpoints).
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: { review: true },
  });
  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }
  if (!booking.review) {
    throw ApiError.notFound('No review submitted for this booking yet');
  }
  return serialize(booking.review);
};

module.exports = { submitReview, getMyReview };

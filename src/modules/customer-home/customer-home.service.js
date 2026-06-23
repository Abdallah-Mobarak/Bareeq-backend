const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { toRelativeUpload } = require('../../utils/mediaUrl');

/**
 * Customer Home — Marketplace §1.2.
 *
 * All queries restrict to active, non-deleted rows. Customers see:
 *   - Categories (§1.2.3): minimal payload (id, title, icon).
 *   - Services list (§1.2.1): image, title, totalCost (sum of subs),
 *     rating.
 *   - Service detail (§1.2.2): full service + every subcategory the
 *     customer can pick from to build their order.
 */

const sumCost = (subs) => subs.reduce((acc, s) => acc + Number(s.cost), 0);

const formatMoney = (n) => n.toFixed(2);

const serializeCategoryCard = (c) => ({
  id: c.id,
  titleAr: c.titleAr,
  titleEn: c.titleEn,
  iconUrl: toRelativeUpload(c.iconUrl),
});

const serializeServiceCard = (svc) => {
  const subs = (svc.subcategories || []).filter((s) => !s.deletedAt);
  return {
    id: svc.id,
    categoryId: svc.categoryId,
    titleAr: svc.titleAr,
    titleEn: svc.titleEn,
    imageUrl: toRelativeUpload(svc.imageUrl),
    totalCost: formatMoney(sumCost(subs)),
    ratingAverage: svc.ratingAverage ? svc.ratingAverage.toString() : null,
    ratingCount: svc.ratingCount,
  };
};

const serializeSubcategory = (s) => ({
  id: s.id,
  titleAr: s.titleAr,
  titleEn: s.titleEn,
  cost: s.cost.toString(),
  sortOrder: s.sortOrder,
});

const serializeServiceDetail = (svc) => {
  const subs = (svc.subcategories || []).filter((s) => !s.deletedAt);
  return {
    id: svc.id,
    categoryId: svc.categoryId,
    titleAr: svc.titleAr,
    titleEn: svc.titleEn,
    descriptionAr: svc.descriptionAr,
    descriptionEn: svc.descriptionEn,
    imageUrl: toRelativeUpload(svc.imageUrl),
    ratingAverage: svc.ratingAverage ? svc.ratingAverage.toString() : null,
    ratingCount: svc.ratingCount,
    subcategories: subs.map(serializeSubcategory),
    // Default cost = full sum (all subs selected). The client subtracts
    // when the user un-picks an item (§1.2.2 "By default, all
    // subcategories are selected").
    totalCost: formatMoney(sumCost(subs)),
  };
};

/**
 * GET /customer/home/categories — list active categories the customer
 * can browse (§1.2.3). Sorted by sortOrder then newest first.
 */
const listCategories = async ({ page, limit }) => {
  const skip = (page - 1) * limit;
  const where = { deletedAt: null, isActive: true };

  const [items, total] = await prisma.$transaction([
    prisma.serviceCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.serviceCategory.count({ where }),
  ]);

  return {
    items: items.map(serializeCategoryCard),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const sortMap = {
  sortOrder: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  rating: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }],
  newest: { createdAt: 'desc' },
};

/**
 * GET /customer/home/services — browse + filter + search (§1.2.1,
 * §1.2.4, §1.2.5).
 *
 * Cost filter is applied in-memory after the DB fetch because
 * total-cost isn't a column (see file header). Rating + categoryId +
 * title search go through Prisma; pagination is on the post-filter
 * result so totals stay correct.
 */
const listServices = async ({
  page,
  limit,
  q,
  categoryId,
  subcategory,
  minRating,
  maxRating,
  minCost,
  maxCost,
  sort,
}) => {
  // Build the DB-level where (everything except cost-range).
  const where = {
    deletedAt: null,
    isActive: true,
    ...(categoryId && { categoryId }),
    ...((minRating !== undefined || maxRating !== undefined) && {
      ratingAverage: {
        ...(minRating !== undefined && { gte: minRating }),
        ...(maxRating !== undefined && { lte: maxRating }),
      },
    }),
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
    // `some` does double duty: hide services with no active subcategories
    // (a "0.00 SAR" card is misleading) AND, when a subcategory name is
    // given, keep only services that have a matching one (§1.2.4).
    subcategories: {
      some: {
        deletedAt: null,
        ...(subcategory && {
          OR: [
            { titleAr: { contains: subcategory, mode: 'insensitive' } },
            { titleEn: { contains: subcategory, mode: 'insensitive' } },
          ],
        }),
      },
    },
  };

  // We need every matching row to filter by computed total cost. For a
  // small MVP catalog that's fine; for scale, denormalise sum onto the
  // Service row or precompute via materialised view.
  const rows = await prisma.service.findMany({
    where,
    orderBy: sortMap[sort] || sortMap.sortOrder,
    include: {
      subcategories: { where: { deletedAt: null } },
    },
  });

  // In-memory cost-range filter + priceAsc/priceDesc sort.
  const withTotal = rows.map((r) => ({
    row: r,
    total: sumCost(r.subcategories),
  }));

  const filtered = withTotal.filter(({ total }) => {
    if (minCost !== undefined && total < minCost) {
      return false;
    }
    if (maxCost !== undefined && total > maxCost) {
      return false;
    }
    return true;
  });

  if (sort === 'priceAsc') {
    filtered.sort((a, b) => a.total - b.total);
  }
  if (sort === 'priceDesc') {
    filtered.sort((a, b) => b.total - a.total);
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const pageItems = filtered.slice(start, start + limit);

  return {
    items: pageItems.map(({ row }) => serializeServiceCard(row)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getServiceDetail = async (id) => {
  const svc = await prisma.service.findFirst({
    where: { id, deletedAt: null, isActive: true },
    include: {
      subcategories: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!svc) {
    throw ApiError.notFound('Service not found');
  }
  return serializeServiceDetail(svc);
};

/**
 * Public reviews for a service. Anyone authenticated as a CUSTOMER
 * can see them — they're the social proof that drives bookings.
 * The customer's name is included so reviews feel like real people;
 * the email/phone are NOT (PII minimisation).
 */
const listServiceReviews = async (serviceId, { page, limit }) => {
  // Verify the service exists & is active before exposing reviews
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!svc) {
    throw ApiError.notFound('Service not found');
  }

  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.review.findMany({
      where: { serviceId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.review.count({ where: { serviceId } }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customer: {
        id: r.customer.id,
        nameAr: r.customer.nameAr,
        nameEn: r.customer.nameEn,
      },
      createdAt: r.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = { listCategories, listServices, getServiceDetail, listServiceReviews };

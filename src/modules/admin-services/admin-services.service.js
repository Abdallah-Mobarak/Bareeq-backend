const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Service (catalog item) CRUD — Marketplace §3.4.1.
 *
 * Each Service has 0..N subcategories. We expose them as a nested
 * array on create / update / get-detail. Cost only lives on the
 * subcategory; the displayed "service cost" is the sum.
 *
 * Soft-delete propagation: deleting a Service also soft-deletes all
 * its subcategories — keeps the customer Home from showing a service
 * with no live subcategories (which would render an empty cost).
 */

const serializeSubcategory = (s) => ({
  id: s.id,
  titleAr: s.titleAr,
  titleEn: s.titleEn,
  cost: s.cost.toString(),
  sortOrder: s.sortOrder,
});

const computeTotalCost = (subcategories) =>
  subcategories.reduce((sum, s) => sum + Number(s.cost), 0).toFixed(2);

const serialize = (svc, { includeSubcategories = false } = {}) => {
  const out = {
    id: svc.id,
    categoryId: svc.categoryId,
    titleAr: svc.titleAr,
    titleEn: svc.titleEn,
    descriptionAr: svc.descriptionAr,
    descriptionEn: svc.descriptionEn,
    imageUrl: svc.imageUrl,
    commissionRate: svc.commissionRate.toString(),
    isActive: svc.isActive,
    sortOrder: svc.sortOrder,
    ratingAverage: svc.ratingAverage ? svc.ratingAverage.toString() : null,
    ratingCount: svc.ratingCount,
    createdAt: svc.createdAt,
    updatedAt: svc.updatedAt,
  };
  if (includeSubcategories) {
    const subs = (svc.subcategories || []).filter((s) => !s.deletedAt);
    out.subcategories = subs.map(serializeSubcategory);
    out.totalCost = computeTotalCost(subs);
  }
  return out;
};

const sortMap = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  sortOrder: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  name: { titleAr: 'asc' },
  rating: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }],
};

const requireActiveCategory = async (categoryId) => {
  const c = await prisma.serviceCategory.findFirst({
    where: { id: categoryId, deletedAt: null },
  });
  if (!c) {
    throw ApiError.badRequest('Category not found');
  }
};

const create = async (data) => {
  await requireActiveCategory(data.categoryId);

  const subcategories = data.subcategories || [];

  const created = await prisma.$transaction(async (tx) => {
    const svc = await tx.service.create({
      data: {
        categoryId: data.categoryId,
        titleAr: data.titleAr,
        titleEn: data.titleEn || null,
        descriptionAr: data.descriptionAr || null,
        descriptionEn: data.descriptionEn || null,
        imageUrl: data.imageUrl || null,
        commissionRate: data.commissionRate ?? 0,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    if (subcategories.length > 0) {
      await tx.serviceSubcategory.createMany({
        data: subcategories.map((s, idx) => ({
          serviceId: svc.id,
          titleAr: s.titleAr,
          titleEn: s.titleEn || null,
          cost: s.cost,
          sortOrder: s.sortOrder ?? idx,
        })),
      });
    }
    return tx.service.findUnique({
      where: { id: svc.id },
      include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  logger.info({ id: created.id }, 'Service created');
  return serialize(created, { includeSubcategories: true });
};

const list = async ({ page, limit, q, categoryId, isActive, sort }) => {
  const skip = (page - 1) * limit;
  const where = {
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(typeof isActive === 'boolean' && { isActive }),
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.service.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortMap[sort] || sortMap.sortOrder,
      include: {
        subcategories: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    }),
    prisma.service.count({ where }),
  ]);

  return {
    items: items.map((s) => serialize(s, { includeSubcategories: true })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const findOrFail = async (id) => {
  const svc = await prisma.service.findFirst({
    where: { id, deletedAt: null },
    include: { subcategories: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!svc) {
    throw ApiError.notFound('Service not found');
  }
  return svc;
};

const getOne = async (id) => serialize(await findOrFail(id), { includeSubcategories: true });

const update = async (id, patch) => {
  await findOrFail(id);

  if (patch.categoryId !== undefined) {
    await requireActiveCategory(patch.categoryId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id },
      data: {
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.titleAr !== undefined && { titleAr: patch.titleAr }),
        ...(patch.titleEn !== undefined && { titleEn: patch.titleEn || null }),
        ...(patch.descriptionAr !== undefined && {
          descriptionAr: patch.descriptionAr || null,
        }),
        ...(patch.descriptionEn !== undefined && {
          descriptionEn: patch.descriptionEn || null,
        }),
        ...(patch.imageUrl !== undefined && { imageUrl: patch.imageUrl || null }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      },
    });

    // Replace-all on subcategories if the array is present in the body.
    if (Array.isArray(patch.subcategories)) {
      // Soft-delete every active row so we can keep an audit trail of
      // what changed (cost adjustments etc.) without losing FK history
      // from any future booking that referenced them.
      await tx.serviceSubcategory.updateMany({
        where: { serviceId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (patch.subcategories.length > 0) {
        await tx.serviceSubcategory.createMany({
          data: patch.subcategories.map((s, idx) => ({
            serviceId: id,
            titleAr: s.titleAr,
            titleEn: s.titleEn || null,
            cost: s.cost,
            sortOrder: s.sortOrder ?? idx,
          })),
        });
      }
    }

    return tx.service.findUnique({
      where: { id },
      include: {
        subcategories: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  logger.info({ id }, 'Service updated');
  return serialize(updated, { includeSubcategories: true });
};

const updateCommission = async (id, { commissionRate }) => {
  await findOrFail(id);
  const updated = await prisma.service.update({
    where: { id },
    data: { commissionRate },
    include: { subcategories: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
  });
  logger.info({ id, commissionRate }, 'Service commission updated');
  return serialize(updated, { includeSubcategories: true });
};

const remove = async (id) => {
  await findOrFail(id);
  const now = new Date();
  await prisma.$transaction([
    prisma.service.update({ where: { id }, data: { deletedAt: now } }),
    prisma.serviceSubcategory.updateMany({
      where: { serviceId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
  logger.info({ id }, 'Service soft-deleted (subcategories cascaded)');
};

module.exports = { create, list, getOne, update, updateCommission, remove };

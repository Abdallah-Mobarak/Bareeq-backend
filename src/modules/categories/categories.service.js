const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

const serializeCategory = (c) => ({
  id: c.id,
  nameAr: c.nameAr,
  nameEn: c.nameEn,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const createCategory = async ({ nameAr, nameEn }) => {
  const created = await prisma.category.create({
    data: { nameAr, nameEn: nameEn || null },
  });
  logger.info({ categoryId: created.id }, 'Category created');
  return serializeCategory(created);
};

const listCategories = async ({ page, limit, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'name'
        ? { nameAr: 'asc' }
        : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({ where, skip, take: limit, orderBy }),
    prisma.category.count({ where }),
  ]);

  return {
    items: items.map(serializeCategory),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getCategory = async (id) => {
  const category = await prisma.category.findFirst({
    where: { id, deletedAt: null },
  });
  if (!category) {
    throw ApiError.notFound('Category not found');
  }
  return serializeCategory(category);
};

const updateCategory = async (id, { nameAr, nameEn }) => {
  const existing = await prisma.category.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Category not found');
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
    },
  });

  logger.info({ categoryId: id }, 'Category updated');
  return serializeCategory(updated);
};

const deleteCategory = async (id) => {
  const existing = await prisma.category.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Category not found');
  }

  // Branches reference category as optional, so we don't block delete —
  // but we do detach the FK from any active branches.
  await prisma.$transaction([
    prisma.branch.updateMany({
      where: { categoryId: id, deletedAt: null },
      data: { categoryId: null },
    }),
    prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);

  logger.info({ categoryId: id }, 'Category soft-deleted (branches detached)');
};

module.exports = {
  createCategory,
  listCategories,
  getCategory,
  updateCategory,
  deleteCategory,
};

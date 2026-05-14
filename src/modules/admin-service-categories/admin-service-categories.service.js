const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin ServiceCategory CRUD — Marketplace §3.4.
 *
 * Soft-delete (`deletedAt`) instead of hard delete because:
 *   - Bookings will reference the category through Service. A hard
 *     delete would cascade-break historical records.
 *   - Admins occasionally want to "undelete" a category.
 *
 * On soft-delete we do NOT cascade to the child Services automatically.
 * Instead, we block the delete if any non-deleted Service references
 * the category — the admin must move/delete those Services first. This
 * keeps the customer Home from showing dangling services.
 */

const serialize = (c) => ({
  id: c.id,
  titleAr: c.titleAr,
  titleEn: c.titleEn,
  iconUrl: c.iconUrl,
  isActive: c.isActive,
  sortOrder: c.sortOrder,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const sortMap = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  sortOrder: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  name: { titleAr: 'asc' },
};

const create = async (data) => {
  const created = await prisma.serviceCategory.create({
    data: {
      titleAr: data.titleAr,
      titleEn: data.titleEn || null,
      iconUrl: data.iconUrl || null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  });
  logger.info({ id: created.id }, 'ServiceCategory created');
  return serialize(created);
};

const list = async ({ page, limit, q, isActive, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(typeof isActive === 'boolean' && { isActive }),
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.serviceCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortMap[sort] || sortMap.sortOrder,
    }),
    prisma.serviceCategory.count({ where }),
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

const findOrFail = async (id) => {
  const c = await prisma.serviceCategory.findFirst({
    where: { id, deletedAt: null },
  });
  if (!c) {
    throw ApiError.notFound('Service category not found');
  }
  return c;
};

const getOne = async (id) => serialize(await findOrFail(id));

const update = async (id, patch) => {
  await findOrFail(id);

  const updated = await prisma.serviceCategory.update({
    where: { id },
    data: {
      ...(patch.titleAr !== undefined && { titleAr: patch.titleAr }),
      ...(patch.titleEn !== undefined && { titleEn: patch.titleEn || null }),
      ...(patch.iconUrl !== undefined && { iconUrl: patch.iconUrl || null }),
      ...(patch.isActive !== undefined && { isActive: patch.isActive }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
    },
  });

  logger.info({ id }, 'ServiceCategory updated');
  return serialize(updated);
};

const remove = async (id) => {
  await findOrFail(id);

  // Block delete if any active Service still references this category.
  // We want admins to consciously move or delete those services first
  // rather than silently leaving them orphaned on customer Home.
  const activeServices = await prisma.service.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (activeServices > 0) {
    throw ApiError.conflict(
      `Cannot delete: ${activeServices} active service(s) still reference this category`,
    );
  }

  await prisma.serviceCategory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  logger.info({ id }, 'ServiceCategory soft-deleted');
};

module.exports = { create, list, getOne, update, remove };

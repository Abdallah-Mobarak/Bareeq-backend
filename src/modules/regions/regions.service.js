const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

const serializeRegion = (r) => ({
  id: r.id,
  nameAr: r.nameAr,
  nameEn: r.nameEn,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const createRegion = async ({ nameAr, nameEn }) => {
  const region = await prisma.region.create({
    data: { nameAr, nameEn: nameEn || null },
  });
  logger.info({ regionId: region.id }, 'Region created');
  return serializeRegion(region);
};

const listRegions = async ({ page, limit, q, sort }) => {
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
    prisma.region.findMany({ where, skip, take: limit, orderBy }),
    prisma.region.count({ where }),
  ]);

  return {
    items: items.map(serializeRegion),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getRegion = async (id) => {
  const region = await prisma.region.findFirst({
    where: { id, deletedAt: null },
  });
  if (!region) {
    throw ApiError.notFound('Region not found');
  }
  return serializeRegion(region);
};

const updateRegion = async (id, { nameAr, nameEn }) => {
  const existing = await prisma.region.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Region not found');
  }

  const updated = await prisma.region.update({
    where: { id },
    data: {
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
    },
  });

  logger.info({ regionId: id }, 'Region updated');
  return serializeRegion(updated);
};

const deleteRegion = async (id) => {
  const existing = await prisma.region.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Region not found');
  }

  // Block delete if any active city still references this region.
  // Cities are catalog data; orphaning them silently is dangerous.
  const activeCity = await prisma.city.findFirst({
    where: { regionId: id, deletedAt: null },
  });
  if (activeCity) {
    throw ApiError.conflict('Region has active cities; delete or reassign them first');
  }

  await prisma.region.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ regionId: id }, 'Region soft-deleted');
};

module.exports = {
  createRegion,
  listRegions,
  getRegion,
  updateRegion,
  deleteRegion,
};
 
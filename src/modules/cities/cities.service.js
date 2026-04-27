const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

const serializeCity = (c) => ({
  id: c.id,
  regionId: c.regionId,
  region: c.region ? { id: c.region.id, nameAr: c.region.nameAr, nameEn: c.region.nameEn } : null,
  nameAr: c.nameAr,
  nameEn: c.nameEn,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const ensureRegionExists = async (regionId) => {
  const region = await prisma.region.findFirst({
    where: { id: regionId, deletedAt: null },
  });
  if (!region) {
    throw ApiError.badRequest('Region not found');
  }
};

const createCity = async ({ regionId, nameAr, nameEn }) => {
  await ensureRegionExists(regionId);

  const city = await prisma.city.create({
    data: { regionId, nameAr, nameEn: nameEn || null },
    include: { region: true },
  });
  logger.info({ cityId: city.id, regionId }, 'City created');
  return serializeCity(city);
};

const listCities = async ({ page, limit, q, regionId, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(regionId && { regionId }),
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
    prisma.city.findMany({ where, skip, take: limit, orderBy, include: { region: true } }),
    prisma.city.count({ where }),
  ]);

  return {
    items: items.map(serializeCity),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getCity = async (id) => {
  const city = await prisma.city.findFirst({
    where: { id, deletedAt: null },
    include: { region: true },
  });
  if (!city) {
    throw ApiError.notFound('City not found');
  }
  return serializeCity(city);
};

const updateCity = async (id, { regionId, nameAr, nameEn }) => {
  const existing = await prisma.city.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('City not found');
  }

  if (regionId && regionId !== existing.regionId) {
    await ensureRegionExists(regionId);
  }

  const updated = await prisma.city.update({
    where: { id },
    data: {
      ...(regionId !== undefined && { regionId }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
    },
    include: { region: true },
  });

  logger.info({ cityId: id }, 'City updated');
  return serializeCity(updated);
};

const deleteCity = async (id) => {
  const existing = await prisma.city.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('City not found');
  }

  await prisma.city.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ cityId: id }, 'City soft-deleted');
};

module.exports = { createCity, listCities, getCity, updateCity, deleteCity };

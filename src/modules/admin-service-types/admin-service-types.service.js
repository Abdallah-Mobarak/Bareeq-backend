const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Service Types — FRD §4.11.2.
 *
 * Bilingual lookup table owned by the admin. Each ServiceType carries
 * its own `hourlyRate` which the Representatives module reads when
 * pricing new agreements. We never hard-delete because Representatives
 * reference these rows via FK — a soft-delete (`deletedAt`) keeps
 * historical agreements intact while removing the type from listings.
 *
 * `hourlyRate` is a Decimal in Postgres. We surface it as a Number in
 * the JSON response to keep the FE simple; the precision we need
 * (2 decimals, max 1,000,000) fits in JS Number safely.
 */

const serializeServiceType = (st) => ({
  id: st.id,
  nameAr: st.nameAr,
  nameEn: st.nameEn,
  hourlyRate: st.hourlyRate ? Number(st.hourlyRate) : 0,
  createdAt: st.createdAt,
  updatedAt: st.updatedAt,
});

const createServiceType = async ({ nameAr, nameEn, hourlyRate }) => {
  const row = await prisma.serviceType.create({
    data: {
      nameAr,
      nameEn: nameEn || null,
      hourlyRate,
    },
  });
  logger.info({ serviceTypeId: row.id }, 'ServiceType created');
  return serializeServiceType(row);
};

const listServiceTypes = async ({ page, limit, q, sort }) => {
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

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'name') orderBy = { nameAr: 'asc' };
  else if (sort === 'rate') orderBy = { hourlyRate: 'desc' };
  else orderBy = { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.serviceType.findMany({ where, skip, take: limit, orderBy }),
    prisma.serviceType.count({ where }),
  ]);

  return {
    items: items.map(serializeServiceType),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getServiceType = async (id) => {
  const row = await prisma.serviceType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!row) throw ApiError.notFound('Service type not found');
  return serializeServiceType(row);
};

const updateServiceType = async (id, body) => {
  const existing = await prisma.serviceType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound('Service type not found');

  const data = {};
  if (body.nameAr !== undefined) data.nameAr = body.nameAr;
  if (body.nameEn !== undefined) data.nameEn = body.nameEn || null;
  if (body.hourlyRate !== undefined) data.hourlyRate = body.hourlyRate;

  const updated = await prisma.serviceType.update({ where: { id }, data });
  logger.info({ serviceTypeId: id }, 'ServiceType updated');
  return serializeServiceType(updated);
};

const deleteServiceType = async (id) => {
  const existing = await prisma.serviceType.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Service type not found');

  await prisma.serviceType.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  logger.info({ serviceTypeId: id }, 'ServiceType soft-deleted');
};

module.exports = {
  createServiceType,
  listServiceTypes,
  getServiceType,
  updateServiceType,
  deleteServiceType,
};

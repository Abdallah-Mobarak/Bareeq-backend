const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

const serializeReason = (r) => ({
  id: r.id,
  titleAr: r.titleAr,
  titleEn: r.titleEn,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const createReason = async ({ titleAr, titleEn }) => {
  const reason = await prisma.notImplementedReason.create({
    data: { titleAr, titleEn: titleEn || null },
  });
  logger.info({ reasonId: reason.id }, 'NotImplementedReason created');
  return serializeReason(reason);
};

const listReasons = async ({ page, limit, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'title'
        ? { titleAr: 'asc' }
        : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.notImplementedReason.findMany({ where, skip, take: limit, orderBy }),
    prisma.notImplementedReason.count({ where }),
  ]);

  return {
    items: items.map(serializeReason),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getReason = async (id) => {
  const reason = await prisma.notImplementedReason.findFirst({
    where: { id, deletedAt: null },
  });
  if (!reason) {
    throw ApiError.notFound('Reason not found');
  }
  return serializeReason(reason);
};

const updateReason = async (id, { titleAr, titleEn }) => {
  const existing = await prisma.notImplementedReason.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Reason not found');
  }

  const updated = await prisma.notImplementedReason.update({
    where: { id },
    data: {
      ...(titleAr !== undefined && { titleAr }),
      ...(titleEn !== undefined && { titleEn: titleEn || null }),
    },
  });

  logger.info({ reasonId: id }, 'Reason updated');
  return serializeReason(updated);
};

const deleteReason = async (id) => {
  const existing = await prisma.notImplementedReason.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Reason not found');
  }

  await prisma.notImplementedReason.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ reasonId: id }, 'Reason soft-deleted');
};

/**
 * Flat list of all active reasons — for the supervisor mobile picker
 * (FRD §1.2.3.1 / §1.4.4.1 "select a reason from a drop-down list managed
 * by the admin"). No pagination: the list is short and the mobile app
 * renders it as a dropdown in one shot.
 */
const listActiveReasons = async () => {
  const items = await prisma.notImplementedReason.findMany({
    where: { deletedAt: null },
    orderBy: { titleAr: 'asc' },
    select: { id: true, titleAr: true, titleEn: true },
  });
  return items;
};

module.exports = {
  createReason,
  listReasons,
  getReason,
  updateReason,
  deleteReason,
  listActiveReasons,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

const serializeSupervisor = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  status: user.status,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createSupervisor = async ({ email, phone, password: plainPassword, nameAr, nameEn }) => {
  const conflict = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }], deletedAt: null },
  });
  if (conflict) {
    throw ApiError.conflict('Email or phone already in use');
  }

  const passwordHash = await password.hash(plainPassword);

  const user = await prisma.user.create({
    data: {
      email,
      phone,
      password: passwordHash,
      role: 'SUPERVISOR',
      status: 'ENABLED',
      nameAr,
      nameEn: nameEn || null,
    },
  });

  logger.info({ supervisorId: user.id }, 'Supervisor created');
  return serializeSupervisor(user);
};

const listSupervisors = async ({ page, limit, q, status, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'SUPERVISOR',
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    }),
    ...(status && { status }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, skip, take: limit, orderBy }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map(serializeSupervisor),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const listAllSupervisorsForExport = async ({ q, status, ids, sort } = {}) => {
  const where = {
    role: 'SUPERVISOR',
    deletedAt: null,
    ...(ids && ids.length > 0 && { id: { in: ids } }),
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    }),
    ...(status && { status }),
  };
  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };
  const items = await prisma.user.findMany({ where, orderBy, take: 5000 });
  return items.map(serializeSupervisor);
};

const getSupervisor = async (id) => {
  const user = await prisma.user.findFirst({
    where: { id, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!user) {
    throw ApiError.notFound('Supervisor not found');
  }
  return serializeSupervisor(user);
};

const updateSupervisor = async (id, { email, phone, nameAr, nameEn }) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Supervisor not found');
  }

  if (email && email !== existing.email) {
    const c = await prisma.user.findFirst({
      where: { email, id: { not: id }, deletedAt: null },
    });
    if (c) {
      throw ApiError.conflict('Email already in use');
    }
  }
  if (phone && phone !== existing.phone) {
    const c = await prisma.user.findFirst({
      where: { phone, id: { not: id }, deletedAt: null },
    });
    if (c) {
      throw ApiError.conflict('Phone already in use');
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
    },
  });

  logger.info({ supervisorId: id }, 'Supervisor updated');
  return serializeSupervisor(updated);
};

const deleteSupervisor = async (id) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Supervisor not found');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ supervisorId: id }, 'Supervisor soft-deleted');
};

const changeSupervisorPassword = async (id, newPassword) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Supervisor not found');
  }

  const passwordHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { password: passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ supervisorId: id }, 'Supervisor password reset by admin');
};

const updateSupervisorStatus = async (id, status) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Supervisor not found');
  }

  if (existing.status === status) {
    return serializeSupervisor(existing);
  }

  const ops = [prisma.user.update({ where: { id }, data: { status } })];
  if (status === 'BLOCKED') {
    ops.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const [updated] = await prisma.$transaction(ops);
  logger.info({ supervisorId: id, status }, 'Supervisor status changed');
  return serializeSupervisor(updated);
};

module.exports = {
  createSupervisor,
  listSupervisors,
  listAllSupervisorsForExport,
  getSupervisor,
  updateSupervisor,
  deleteSupervisor,
  changeSupervisorPassword,
  updateSupervisorStatus,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Admins management — FRD §4.2.3.
 *
 * The Admin role is the same User row as everyone else (role=ADMIN);
 * what makes it "admin-managed" is the dedicated CRUD endpoints, plus
 * an optional permissionRoleId scoping the surface they can touch
 * (FRD §4.2.3.2).
 *
 * The bootstrap admin (seeded via scripts/seed-admin.js) has no
 * permissionRoleId and bypasses the requirePermission middleware —
 * that's intentional so an empty permission table never locks out
 * the platform.
 */

const serializeAdmin = (u) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  nameAr: u.nameAr,
  nameEn: u.nameEn,
  status: u.status,
  permissionRoleId: u.permissionRoleId,
  permissionRole: u.permissionRole
    ? { id: u.permissionRole.id, name: u.permissionRole.name }
    : null,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

const validatePermissionRole = async (permissionRoleId) => {
  if (!permissionRoleId) return;
  const role = await prisma.permissionRole.findFirst({
    where: { id: permissionRoleId, deletedAt: null },
  });
  if (!role) {
    throw ApiError.badRequest('Permission role not found');
  }
};

const createAdmin = async ({
  email,
  phone,
  password: plainPassword,
  nameAr,
  nameEn,
  permissionRoleId,
}) => {
  const conflict = await prisma.user.findFirst({
    where: {
      OR: [{ email }, ...(phone ? [{ phone }] : [])],
      deletedAt: null,
    },
  });
  if (conflict) {
    throw ApiError.conflict('Email or phone already in use');
  }

  await validatePermissionRole(permissionRoleId);

  const passwordHash = await password.hash(plainPassword);

  const user = await prisma.user.create({
    data: {
      email,
      phone: phone || null,
      password: passwordHash,
      role: 'ADMIN',
      status: 'ENABLED',
      nameAr,
      nameEn: nameEn || null,
      permissionRoleId: permissionRoleId || null,
    },
    include: { permissionRole: true },
  });

  logger.info({ adminId: user.id }, 'Admin created');
  return serializeAdmin(user);
};

const listAdmins = async ({ page, limit, q, status, permissionRoleId, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'ADMIN',
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(status && { status }),
    ...(permissionRoleId && { permissionRoleId }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { permissionRole: true },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map(serializeAdmin),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getAdmin = async (id) => {
  const user = await prisma.user.findFirst({
    where: { id, role: 'ADMIN', deletedAt: null },
    include: { permissionRole: true },
  });
  if (!user) {
    throw ApiError.notFound('Admin not found');
  }
  return serializeAdmin(user);
};

const updateAdmin = async (id, { email, phone, nameAr, nameEn, permissionRoleId }) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ADMIN', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Admin not found');
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

  if (permissionRoleId !== undefined && permissionRoleId !== null && permissionRoleId !== '') {
    await validatePermissionRole(permissionRoleId);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
      ...(permissionRoleId !== undefined && { permissionRoleId: permissionRoleId || null }),
    },
    include: { permissionRole: true },
  });

  logger.info({ adminId: id }, 'Admin updated');
  return serializeAdmin(updated);
};

/**
 * Soft delete. Admin cannot delete itself — same guard as the managers
 * module. Also cannot delete the last enabled admin (would lock the
 * platform out).
 */
const deleteAdmin = async (id, actorId) => {
  if (id === actorId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const existing = await prisma.user.findFirst({
    where: { id, role: 'ADMIN', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Admin not found');
  }

  const otherEnabledAdmins = await prisma.user.count({
    where: {
      role: 'ADMIN',
      status: 'ENABLED',
      deletedAt: null,
      id: { not: id },
    },
  });
  if (otherEnabledAdmins === 0) {
    throw ApiError.badRequest('Cannot delete the last enabled admin');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ adminId: id, actorId }, 'Admin soft-deleted');
};

const changeAdminPassword = async (id, newPassword) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'ADMIN', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Admin not found');
  }

  const passwordHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ adminId: id }, 'Admin password reset');
};

const updateAdminStatus = async (id, status, actorId) => {
  if (id === actorId && status === 'BLOCKED') {
    throw ApiError.badRequest('You cannot block your own account');
  }

  const existing = await prisma.user.findFirst({
    where: { id, role: 'ADMIN', deletedAt: null },
    include: { permissionRole: true },
  });
  if (!existing) {
    throw ApiError.notFound('Admin not found');
  }

  if (existing.status === status) {
    return serializeAdmin(existing);
  }

  if (status === 'BLOCKED') {
    const otherEnabled = await prisma.user.count({
      where: {
        role: 'ADMIN',
        status: 'ENABLED',
        deletedAt: null,
        id: { not: id },
      },
    });
    if (otherEnabled === 0) {
      throw ApiError.badRequest('Cannot block the last enabled admin');
    }
  }

  const ops = [
    prisma.user.update({
      where: { id },
      data: { status },
      include: { permissionRole: true },
    }),
  ];
  if (status === 'BLOCKED') {
    ops.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const [updated] = await prisma.$transaction(ops);
  logger.info({ adminId: id, status }, 'Admin status changed');
  return serializeAdmin(updated);
};

/**
 * "Update my own profile" — FRD §4.1. Email change is allowed; password
 * has its own dedicated endpoint because it must revoke sessions.
 */
const updateOwnProfile = async (userId, { email, nameAr, nameEn }) => {
  const me = await prisma.user.findFirst({
    where: { id: userId, role: 'ADMIN', deletedAt: null },
  });
  if (!me) {
    throw ApiError.notFound('Account not found');
  }

  if (email && email !== me.email) {
    const c = await prisma.user.findFirst({
      where: { email, id: { not: userId }, deletedAt: null },
    });
    if (c) {
      throw ApiError.conflict('Email already in use');
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(email !== undefined && { email }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
    },
    include: { permissionRole: true },
  });

  logger.info({ adminId: userId }, 'Admin updated own profile');
  return serializeAdmin(updated);
};

const changeOwnPassword = async (userId, { currentPassword, newPassword }) => {
  const me = await prisma.user.findFirst({
    where: { id: userId, role: 'ADMIN', deletedAt: null },
  });
  if (!me) {
    throw ApiError.notFound('Account not found');
  }

  const ok = await password.compare(currentPassword, me.password);
  if (!ok) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  const passwordHash = await password.hash(newPassword);

  /**
   * Revoke all refresh tokens *except* the one currently in use is hard
   * because the access token doesn't carry a refresh-token id. Easier
   * and safer: revoke everything; the client just logs in again.
   */
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ adminId: userId }, 'Admin changed own password');
};

module.exports = {
  createAdmin,
  listAdmins,
  getAdmin,
  updateAdmin,
  deleteAdmin,
  changeAdminPassword,
  updateAdminStatus,
  updateOwnProfile,
  changeOwnPassword,
};

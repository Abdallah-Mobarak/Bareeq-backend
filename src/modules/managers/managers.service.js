const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Strip sensitive and irrelevant fields from a User record before
 * returning it as a "manager" payload. Never leak `password`.
 */
const serializeManager = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  status: user.status,
  permissionRoleId: user.permissionRoleId,
  permissionRole: user.permissionRole
    ? { id: user.permissionRole.id, name: user.permissionRole.name }
    : null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * Throws ApiError.badRequest if `permissionRoleId` is set but doesn't
 * exist. Roles aren't bound to a user type per FRD §4.2.1.2 — the admin
 * picks any role from the unified list.
 */
const validatePermissionRole = async (permissionRoleId) => {
  if (!permissionRoleId) {
    return;
  }

  const role = await prisma.permissionRole.findFirst({
    where: { id: permissionRoleId, deletedAt: null },
  });

  if (!role) {
    throw ApiError.badRequest('Permission role not found');
  }
};

/**
 * Create a new manager. Email and phone are unique across the entire
 * users table — a phone in use by a supervisor is still a conflict.
 */
const createManager = async ({
  email,
  phone,
  password: plainPassword,
  nameAr,
  nameEn,
  permissionRoleId,
}) => {
  // Cross-table uniqueness check
  const conflict = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phone }],
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
      phone,
      password: passwordHash,
      role: 'MANAGER',
      status: 'ENABLED',
      nameAr,
      nameEn: nameEn || null,
      permissionRoleId: permissionRoleId || null,
    },
    include: { permissionRole: true },
  });

  logger.info({ managerId: user.id }, 'Manager created');
  return serializeManager(user);
};

/**
 * Paginated, searchable, filterable list of managers.
 * Uses a single transaction for items + count to keep them consistent.
 */
const listManagers = async ({ page, limit, q, status, permissionRoleId, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'MANAGER',
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
    items: items.map(serializeManager),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getManager = async (id) => {
  const user = await prisma.user.findFirst({
    where: { id, role: 'MANAGER', deletedAt: null },
    include: { permissionRole: true },
  });
  if (!user) {
    throw ApiError.notFound('Manager not found');
  }
  return serializeManager(user);
};

/**
 * Profile updates only. Password and status are separate endpoints.
 */
const updateManager = async (id, { email, phone, nameAr, nameEn, permissionRoleId }) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Manager not found');
  }

  // Uniqueness checks only when the value actually changes
  if (email && email !== existing.email) {
    const conflict = await prisma.user.findFirst({
      where: { email, id: { not: id }, deletedAt: null },
    });
    if (conflict) {
      throw ApiError.conflict('Email already in use');
    }
  }
  if (phone && phone !== existing.phone) {
    const conflict = await prisma.user.findFirst({
      where: { phone, id: { not: id }, deletedAt: null },
    });
    if (conflict) {
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
      ...(phone !== undefined && { phone }),
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
      ...(permissionRoleId !== undefined && {
        permissionRoleId: permissionRoleId || null,
      }),
    },
    include: { permissionRole: true },
  });

  logger.info({ managerId: id }, 'Manager updated');
  return serializeManager(updated);
};

/**
 * Soft delete. Also revokes all active refresh tokens so the manager is
 * kicked out immediately instead of staying alive until access expires.
 */
const deleteManager = async (id, actorId) => {
  if (id === actorId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const existing = await prisma.user.findFirst({
    where: { id, role: 'MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Manager not found');
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

  logger.info({ managerId: id, actorId }, 'Manager soft-deleted');
};

/**
 * Admin-driven password reset. Always revokes existing sessions —
 * if you don't trust the old password, you don't trust the old tokens.
 */
const changeManagerPassword = async (id, newPassword) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Manager not found');
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

  logger.info({ managerId: id }, 'Manager password reset by admin');
};

/**
 * Toggle ENABLED / BLOCKED. Blocking also revokes all sessions so the
 * manager loses access within seconds, not within their access-token TTL.
 */
const updateManagerStatus = async (id, status) => {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'MANAGER', deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Manager not found');
  }

  // No-op short-circuit
  if (existing.status === status) {
    return serializeManager({ ...existing, permissionRole: null });
  }

  const operations = [
    prisma.user.update({
      where: { id },
      data: { status },
      include: { permissionRole: true },
    }),
  ];

  if (status === 'BLOCKED') {
    operations.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const [updated] = await prisma.$transaction(operations);
  logger.info({ managerId: id, status }, 'Manager status changed');
  return serializeManager(updated);
};

module.exports = {
  createManager,
  listManagers,
  getManager,
  updateManager,
  deleteManager,
  changeManagerPassword,
  updateManagerStatus,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * PermissionRole — FRD §4.2.1.2 + §4.2.3.2.
 *
 * A named bundle of permissions. The admin picks one from the unified
 * list when creating a manager or admin user (FRD §4.2.1.1.2 /
 * §4.2.3.1.2 — "Role (selectable)"). The role itself does not record
 * who it applies to; the user assignment decides that.
 *
 * Lifecycle:
 *   1. Admin GET /permissions  -> sees the catalog
 *   2. Admin POST /permission-roles { name, permissionKeys }
 *   3. Admin POST /managers (or /admins) { ..., permissionRoleId }
 *   4. User logs in -> JWT carries permissionRoleId
 *   5. requirePermission middleware loads the role's permissions and
 *      decides allow/deny.
 */

const serializeRole = (role) => ({
  id: role.id,
  name: role.name,
  permissions: (role.permissions || []).map((rp) => ({
    id: rp.permission.id,
    key: rp.permission.key,
    module: rp.permission.module,
    descriptionAr: rp.permission.descriptionAr,
    descriptionEn: rp.permission.descriptionEn,
  })),
  usersCount: role._count?.users ?? 0,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

/**
 * Resolve permission keys -> permission IDs. Throws if any key is unknown.
 */
const resolvePermissionIds = async (keys) => {
  if (!keys || keys.length === 0) {
    return [];
  }

  const unique = [...new Set(keys)];
  const permissions = await prisma.permission.findMany({
    where: { key: { in: unique } },
    select: { id: true, key: true },
  });

  if (permissions.length !== unique.length) {
    const foundKeys = new Set(permissions.map((p) => p.key));
    const missing = unique.filter((k) => !foundKeys.has(k));
    throw ApiError.badRequest('Unknown permission keys', { missing });
  }

  return permissions.map((p) => p.id);
};

const createRole = async ({ name, permissionKeys }) => {
  const permissionIds = await resolvePermissionIds(permissionKeys);

  const conflict = await prisma.permissionRole.findFirst({
    where: { name, deletedAt: null },
  });
  if (conflict) {
    throw ApiError.conflict('A role with this name already exists');
  }

  const role = await prisma.permissionRole.create({
    data: {
      name,
      permissions: {
        create: permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });

  logger.info({ roleId: role.id }, 'Permission role created');
  return serializeRole(role);
};

const listRoles = async ({ page, limit, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      name: { contains: q, mode: 'insensitive' },
    }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.permissionRole.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.permissionRole.count({ where }),
  ]);

  return {
    items: items.map(serializeRole),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getRole = async (id) => {
  const role = await prisma.permissionRole.findFirst({
    where: { id, deletedAt: null },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) {
    throw ApiError.notFound('Permission role not found');
  }
  return serializeRole(role);
};

const updateRole = async (id, { name, permissionKeys }) => {
  const existing = await prisma.permissionRole.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Permission role not found');
  }

  if (name && name !== existing.name) {
    const conflict = await prisma.permissionRole.findFirst({
      where: { name, deletedAt: null, id: { not: id } },
    });
    if (conflict) {
      throw ApiError.conflict('A role with this name already exists');
    }
  }

  let permissionIds = null;
  if (permissionKeys !== undefined) {
    permissionIds = await resolvePermissionIds(permissionKeys);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.permissionRole.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
      },
    });

    // Replace-all semantics on permissions — simpler than diffing.
    if (permissionIds !== null) {
      await tx.permissionRolePermission.deleteMany({
        where: { permissionRoleId: id },
      });
      if (permissionIds.length > 0) {
        await tx.permissionRolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            permissionRoleId: id,
            permissionId,
          })),
        });
      }
    }

    return tx.permissionRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  });

  logger.info({ roleId: id }, 'Permission role updated');
  return serializeRole(updated);
};

/**
 * Soft delete. Refuses if any active user is still linked — admin
 * must reassign or delete those users first to avoid a sudden gap.
 */
const deleteRole = async (id) => {
  const existing = await prisma.permissionRole.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) {
    throw ApiError.notFound('Permission role not found');
  }

  if (existing._count.users > 0) {
    throw ApiError.conflict(
      'Cannot delete: role is still assigned to one or more users. Reassign them first.',
      { usersCount: existing._count.users },
    );
  }

  await prisma.permissionRole.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ roleId: id }, 'Permission role soft-deleted');
};

module.exports = {
  createRole,
  listRoles,
  getRole,
  updateRole,
  deleteRole,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Manager Tasks — FRD §4.2.1.3.
 *
 * Two audiences:
 *   - ADMIN: full CRUD on tasks assigned to any manager.
 *   - MANAGER: sees only their own tasks; can flip the `done` flag.
 *
 * The split is enforced in routes via requireRole + a service-level
 * "is this task mine?" check on the manager-side endpoints.
 */

const serializeTask = (t) => ({
  id: t.id,
  managerId: t.managerId,
  manager: t.manager
    ? { id: t.manager.id, nameAr: t.manager.nameAr, nameEn: t.manager.nameEn, email: t.manager.email }
    : null,
  title: t.title,
  description: t.description,
  done: t.done,
  status: t.done ? 'DONE' : 'NOT_DONE',
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

const ensureManager = async (managerId) => {
  const m = await prisma.user.findFirst({
    where: { id: managerId, role: 'MANAGER', deletedAt: null },
  });
  if (!m) {
    throw ApiError.badRequest('Manager not found');
  }
};

// ---------- Admin-side ----------

const createTask = async ({ managerId, title, description }) => {
  await ensureManager(managerId);

  const task = await prisma.managerTask.create({
    data: { managerId, title, description: description || null },
    include: { manager: true },
  });

  logger.info({ taskId: task.id, managerId }, 'Manager task created by admin');
  return serializeTask(task);
};

const listTasks = async ({ page, limit, q, managerId, done, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        {
          manager: {
            OR: [
              { nameAr: { contains: q, mode: 'insensitive' } },
              { nameEn: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ],
    }),
    ...(managerId && { managerId }),
    ...(done !== undefined && { done }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.managerTask.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { manager: true },
    }),
    prisma.managerTask.count({ where }),
  ]);

  return {
    items: items.map(serializeTask),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getTask = async (id) => {
  const task = await prisma.managerTask.findFirst({
    where: { id, deletedAt: null },
    include: { manager: true },
  });
  if (!task) {
    throw ApiError.notFound('Task not found');
  }
  return serializeTask(task);
};

const updateTask = async (id, { managerId, title, description }) => {
  const existing = await prisma.managerTask.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Task not found');
  }

  if (managerId && managerId !== existing.managerId) {
    await ensureManager(managerId);
  }

  const updated = await prisma.managerTask.update({
    where: { id },
    data: {
      ...(managerId !== undefined && { managerId }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
    },
    include: { manager: true },
  });

  logger.info({ taskId: id }, 'Manager task updated');
  return serializeTask(updated);
};

const deleteTask = async (id) => {
  const existing = await prisma.managerTask.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Task not found');
  }

  await prisma.managerTask.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ taskId: id }, 'Manager task deleted');
};

// ---------- Manager-side (self-service) ----------

/**
 * Manager-scoped list. Same filters as admin but locked to the
 * caller's own tasks at the where-clause level.
 */
const listMyTasks = async (managerId, { page, limit, q, done, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    managerId,
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(done !== undefined && { done }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.managerTask.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { manager: true },
    }),
    prisma.managerTask.count({ where }),
  ]);

  return {
    items: items.map(serializeTask),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Toggle / set the `done` flag on one of *my* tasks. Refuses if the
 * task belongs to another manager — that's a 404, not a 403, so we
 * don't leak the existence of other managers' tasks.
 */
const setMyTaskStatus = async (managerId, taskId, done) => {
  const task = await prisma.managerTask.findFirst({
    where: { id: taskId, managerId, deletedAt: null },
    include: { manager: true },
  });
  if (!task) {
    throw ApiError.notFound('Task not found');
  }

  if (task.done === done) {
    return serializeTask(task);
  }

  const updated = await prisma.managerTask.update({
    where: { id: taskId },
    data: { done },
    include: { manager: true },
  });

  logger.info({ taskId, managerId, done }, 'Manager task status updated by manager');
  return serializeTask(updated);
};

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  listMyTasks,
  setMyTaskStatus,
};

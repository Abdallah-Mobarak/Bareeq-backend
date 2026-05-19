const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin System Settings — FRD §4.1.
 *
 * Thin CRUD over the SystemSetting key/value table. The admin is
 * trusted to know which keys exist and which keys the FE consumes —
 * we don't enumerate them server-side so adding a new setting is a
 * pure FE/admin operation, no migration needed.
 *
 * Public read of a SAFE subset lives in the sibling system-settings
 * module; this one is full read/write and admin-only.
 */

const serialize = (s) => ({
  key: s.key,
  value: s.value,
  updatedAt: s.updatedAt,
});

const listAll = async () => {
  const items = await prisma.systemSetting.findMany({
    orderBy: { key: 'asc' },
  });
  return items.map(serialize);
};

const getOne = async (key) => {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) throw ApiError.notFound('Setting not found');
  return serialize(row);
};

/**
 * Idempotent upsert. Same call works for "create new key" and
 * "update existing key" — simpler API surface than separate POST +
 * PATCH endpoints for a flat key/value store.
 */
const upsert = async (key, value) => {
  const row = await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  logger.info({ key }, 'SystemSetting upserted');
  return serialize(row);
};

const remove = async (key) => {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) throw ApiError.notFound('Setting not found');
  await prisma.systemSetting.delete({ where: { key } });
  logger.info({ key }, 'SystemSetting deleted');
};

module.exports = { listAll, getOne, upsert, remove };

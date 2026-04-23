const { PrismaClient } = require('@prisma/client');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/env');

/**
 * Shared PrismaClient instance.
 *
 * CRITICAL: Create exactly ONE instance per Node process.
 * Creating multiple instances exhausts the PostgreSQL connection pool
 * and leads to `too many clients already` errors under load.
 *
 * Every module that needs DB access imports `prisma` from this file.
 */
const prisma = new PrismaClient({
  log: config.isDevelopment ? ['warn', 'error'] : ['error'],
});

/**
 * Verify the database is reachable with a lightweight query.
 * Used on startup (fail fast) and inside the /health endpoint.
 *
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
const checkDatabaseConnection = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

/**
 * Gracefully close the Prisma connection pool.
 * Called from the signal handlers in src/index.js during shutdown.
 */
const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ err: error }, 'Error while disconnecting database');
  }
};

module.exports = {
  prisma,
  checkDatabaseConnection,
  disconnectDatabase,
};

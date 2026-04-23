const pino = require('pino');
const { config } = require('../config/env');

/**
 * Central application logger (Pino).
 *
 * Why Pino?
 *   - Very fast (lower overhead than Winston/Bunyan)
 *   - Outputs structured JSON in production (machine-readable)
 *   - In development, pino-pretty reformats JSON into colored human-friendly lines
 *
 * Usage:
 *   const { logger } = require('#utils/logger');
 *   logger.info({ userId }, 'User logged in');
 *   logger.error({ err }, 'Failed to send SMS');
 */
const logger = pino({
  level: config.logging.level,
  // In dev: pretty-print. In prod: raw JSON (faster, easier for log aggregators).
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

module.exports = { logger };

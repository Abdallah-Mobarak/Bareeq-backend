const { config } = require('./config/env');
const { logger } = require('./utils/logger');
const { checkDatabaseConnection, disconnectDatabase } = require('./infrastructure/database/prisma');
const app = require('./app');

/**
 * Process entry point.
 *
 *   1. Verify the database is reachable (fail fast if not).
 *   2. Start the HTTP server.
 *   3. Wire up graceful shutdown on SIGINT / SIGTERM.
 *   4. Catch unhandled Promise rejections and uncaught exceptions.
 *
 * Why fail fast on DB?
 *   If Postgres is down at startup, we'd rather crash immediately
 *   than appear healthy while every real request returns 500.
 *
 * Why graceful shutdown?
 *   When the process receives a kill signal (deploy, docker stop),
 *   we stop accepting new connections but finish the in-flight ones,
 *   then cleanly close the DB pool before exiting.
 */

const start = async () => {
  // 1. Verify DB
  const dbCheck = await checkDatabaseConnection();
  if (!dbCheck.ok) {
    logger.fatal({ error: dbCheck.error }, 'Database unreachable on startup');
    process.exit(1);
  }
  logger.info('Database connection verified');

  // 2. Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port} (env: ${config.nodeEnv})`);
    logger.info(`API available at http://localhost:${config.port}${config.apiPrefix}`);
    logger.info(`Health check at http://localhost:${config.port}/health`);
  });

  // 3. Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received — closing gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete. Goodbye.');
      process.exit(0);
    });

    // Safety net: force-exit after 10s if something is stuck
    setTimeout(() => {
      logger.error('Shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// 4. Top-level error handlers
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception — shutting down');
  process.exit(1);
});

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});

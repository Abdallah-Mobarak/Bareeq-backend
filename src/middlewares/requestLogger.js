const { logger } = require('../utils/logger');

/**
 * Logs every HTTP request after the response is sent.
 * Captures method, URL, status code, and duration.
 *
 * Placed early in the middleware chain so it sees all routes.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLine = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`;

    const payload = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
    };

    if (res.statusCode >= 500) {
      logger.error(payload, logLine);
    } else if (res.statusCode >= 400) {
      logger.warn(payload, logLine);
    } else {
      logger.info(payload, logLine);
    }
  });

  next();
};

module.exports = { requestLogger };

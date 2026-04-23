const { ApiError } = require('../utils/ApiError');
const { logger } = require('../utils/logger');
const { config } = require('../config/env');

/**
 * Global error handler — MUST be the last middleware registered.
 *
 * Flow:
 *   1. Any `throw` or `next(err)` in a route lands here.
 *   2. If it's not an ApiError (i.e. a bug or native error), wrap it.
 *   3. Log server errors (>=500) loudly; log client errors (4xx) quietly.
 *   4. Return a uniform JSON response shape.
 *
 * Stack traces are only included in dev to avoid leaking internals in prod.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Wrap non-ApiError exceptions so the response shape is consistent
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    error = new ApiError(statusCode, message);
    error.isOperational = false;
  }

  // Log — server errors deserve the full stack, client errors do not
  const logPayload = {
    statusCode: error.statusCode,
    path: req.originalUrl,
    method: req.method,
    message: error.message,
  };

  if (error.statusCode >= 500) {
    logger.error({ ...logPayload, stack: err.stack }, 'Server error');
  } else {
    logger.warn(logPayload, 'Client error');
  }

  // Uniform JSON response
  const response = {
    success: false,
    error: {
      message: error.message,
      ...(error.details && { details: error.details }),
    },
  };

  // Leak the stack trace only in dev
  if (config.isDevelopment && error.statusCode >= 500) {
    response.error.stack = err.stack;
  }

  res.status(error.statusCode).json(response);
};

module.exports = { errorHandler };

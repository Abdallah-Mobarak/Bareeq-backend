const { ApiError } = require('../utils/ApiError');

/**
 * Catches requests that didn't match any route.
 * Must be registered AFTER all route handlers but BEFORE errorHandler.
 */
const notFound = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = { notFound };

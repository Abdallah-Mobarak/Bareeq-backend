/**
 * ApiError — the only error type we throw from business code.
 *
 * Why a custom class?
 *   - The errorHandler middleware can check `err instanceof ApiError` to know
 *     this is a safe-to-show-user error (vs a bug/crash).
 *   - Carries an HTTP status code alongside the message.
 *   - Static factories (ApiError.notFound, ApiError.badRequest) keep calling code tidy.
 *
 * Usage:
 *   throw ApiError.notFound('Branch not found');
 *   throw ApiError.badRequest('Invalid phone number', { field: 'phone' });
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code (400, 401, 404, 500, etc.)
   * @param {string} message User-safe error message
   * @param {object | null} [details] Optional structured details (field errors, etc.)
   */
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distinguishes from bugs/crashes
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  static unprocessable(message, details) {
    return new ApiError(422, message, details);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

module.exports = { ApiError };

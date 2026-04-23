/**
 * asyncHandler — wraps an async Express route handler so rejected
 * Promises are forwarded to the errorHandler middleware.
 *
 * Without this wrapper, throwing inside an async route crashes the
 * process instead of returning a clean 500 response.
 *
 * Usage:
 *   router.get('/:id', asyncHandler(async (req, res) => {
 *     const user = await userService.findById(req.params.id);
 *     res.json(user);
 *   }));
 *
 * @param {Function} fn async (req, res, next) => {...}
 * @returns {Function}
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };

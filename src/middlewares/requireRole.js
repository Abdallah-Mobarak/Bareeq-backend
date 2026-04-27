const { ApiError } = require('../utils/ApiError');

/**
 * Express middleware factory: limit a route to specific SystemRoles.
 * MUST be placed AFTER requireAuth so req.user is populated.
 *
 * Usage:
 *   router.get('/admins',
 *     requireAuth,
 *     requireRole('ADMIN'),
 *     controller.list,
 *   );
 *
 *   // multiple roles allowed:
 *   router.get('/teams',
 *     requireAuth,
 *     requireRole('ADMIN', 'MANAGER'),
 *     controller.list,
 *   );
 */
const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient role for this resource'));
    }
    return next();
  };

module.exports = requireRole;

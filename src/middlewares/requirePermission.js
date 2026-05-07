const { ApiError } = require('../utils/ApiError');
const { prisma } = require('../infrastructure/database/prisma');

/**
 * Express middleware factory: gate a route behind one or more permission keys.
 *
 * Usage:
 *   router.get('/sales',
 *     requireAuth,
 *     requirePermission('VIEW_SALES'),
 *     controller.list);
 *
 *   // multi-key (any-of): allow if user has ANY of these
 *   router.post('/sales',
 *     requireAuth,
 *     requirePermission('MANAGE_SALES'),
 *     controller.create);
 *
 * Authorisation policy:
 *   - ADMIN with no permissionRoleId  -> allowed (root admin / bootstrap account)
 *   - ADMIN with a permissionRoleId   -> must hold the required key
 *   - MANAGER without permissionRoleId -> denied (managers must be scoped)
 *   - MANAGER with permissionRoleId   -> must hold the required key
 *   - SUPERVISOR / COMPANY_USER       -> denied (these roles use fixed
 *                                        capabilities, not dynamic permissions)
 *
 * Always pair with requireAuth — this middleware assumes req.user is set.
 *
 * Note on performance: every protected request hits the DB. If load
 * becomes an issue, swap in an in-memory cache keyed on permissionRoleId
 * with a short TTL. Premature for now.
 */
const requirePermission = (...requiredKeys) => async (req, res, next) => {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (requiredKeys.length === 0) {
      return next(
        ApiError.internal('requirePermission called with no keys — programmer error'),
      );
    }

    const { role, permissionRoleId } = req.user;

    // Bootstrap admin without a permissionRoleId keeps full access. This
    // is the seeded root account; production admins should be created
    // with explicit roles after setup.
    if (role === 'ADMIN' && !permissionRoleId) {
      return next();
    }

    if (role !== 'ADMIN' && role !== 'MANAGER') {
      return next(ApiError.forbidden('This role does not use dynamic permissions'));
    }

    if (!permissionRoleId) {
      return next(
        ApiError.forbidden('No permission role assigned. Contact your administrator.'),
      );
    }

    const role_ = await prisma.permissionRole.findFirst({
      where: { id: permissionRoleId, deletedAt: null },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });

    if (!role_) {
      return next(
        ApiError.forbidden('Your permission role no longer exists. Contact your administrator.'),
      );
    }

    const heldKeys = new Set(role_.permissions.map((rp) => rp.permission.key));
    const hasAny = requiredKeys.some((key) => heldKeys.has(key));

    if (!hasAny) {
      return next(
        ApiError.forbidden('You do not have permission to perform this action', {
          required: requiredKeys,
        }),
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = requirePermission;

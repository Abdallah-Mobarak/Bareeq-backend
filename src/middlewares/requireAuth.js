const { ApiError } = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const { prisma } = require('../infrastructure/database/prisma');

/**
 * Express middleware: parse the Authorization header, verify the JWT,
 * and attach the current identity to req.user.
 *
 * Conventions:
 *   - Header format: `Authorization: Bearer <jwt>`
 *   - On success: req.user = { id, role, permissionRoleId }
 *   - On failure: a 401 ApiError is forwarded to errorHandler
 *
 * Why we re-fetch permissionRoleId from the DB on every request:
 *   The JWT used to carry permissionRoleId baked in at login. That meant
 *   if an admin moved a manager to a new role (or first assigned one),
 *   the change wouldn't take effect until the user logged out and back
 *   in — confusing for users and a security hole when revoking access.
 *   The lookup is a single PK query, so the cost is negligible.
 *
 *   The fetch also picks up `deletedAt`, so a deactivated user is locked
 *   out immediately without waiting for their access token to expire.
 *
 * Backwards compatibility: tokens issued before this change still have
 * `permissionRoleId` inside the JWT payload — we ignore it. The DB is
 * the single source of truth now.
 */
const requireAuth = async (req, res, next) => {
  const header = req.get('authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(ApiError.unauthorized('Missing access token'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token expired'));
    }
    return next(ApiError.unauthorized('Invalid access token'));
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, role: true, permissionRoleId: true },
    });

    if (!user) {
      return next(ApiError.unauthorized('Account no longer active'));
    }

    req.user = {
      id: user.id,
      role: user.role,
      permissionRoleId: user.permissionRoleId,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = requireAuth;

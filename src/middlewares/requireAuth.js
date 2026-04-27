const { ApiError } = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');

/**
 * Express middleware: parse the Authorization header, verify the JWT,
 * and attach the decoded identity to req.user.
 *
 * Conventions:
 *   - Header format: `Authorization: Bearer <jwt>`
 *   - On success: req.user = { id, role, permissionRoleId }
 *   - On failure: a 401 ApiError is forwarded to errorHandler
 *
 * Token-expired vs token-invalid produce different messages so the
 * client can react differently (e.g. trigger a refresh on expiry).
 */
const requireAuth = (req, res, next) => {
  const header = req.get('authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(ApiError.unauthorized('Missing access token'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      permissionRoleId: payload.permissionRoleId ?? null,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token expired'));
    }
    return next(ApiError.unauthorized('Invalid access token'));
  }
};

module.exports = requireAuth;

const { asyncHandler } = require('../../utils/asyncHandler');
const authService = require('./auth.service');

/**
 * POST /auth/login — public.
 * Body validated by auth.validation.loginSchema.
 *
 * Falls back to the User-Agent header if the client doesn't send `deviceInfo`.
 * That gives us at least a hint of which device a refresh token belongs to,
 * useful for the future "list active sessions" endpoint.
 */
const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    identifier: req.body.identifier,
    password: req.body.password,
    deviceInfo: req.body.deviceInfo || req.get('user-agent') || null,
    clientType: req.body.clientType,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /auth/refresh — public.
 * Body validated by auth.validation.refreshTokenSchema.
 * Rotates the refresh token; the old one is revoked atomically.
 */
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh({
    refreshToken: req.body.refreshToken,
    deviceInfo: req.get('user-agent') || null,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /auth/logout — public.
 * Body validated by auth.validation.refreshTokenSchema.
 * Idempotent: returns 200 even for already-revoked tokens.
 */
const logout = asyncHandler(async (req, res) => {
  await authService.logout({ refreshToken: req.body.refreshToken });

  res.json({
    success: true,
    data: { message: 'Logged out' },
  });
});

/**
 * GET /auth/me — requires Authorization header.
 * Re-fetches the user from DB so any status / profile change is reflected.
 */
const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);

  res.json({
    success: true,
    data: { user },
  });
});

module.exports = { login, refresh, logout, me };

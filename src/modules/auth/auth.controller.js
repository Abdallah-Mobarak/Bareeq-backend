const { asyncHandler } = require('../../utils/asyncHandler');
const authService = require('./auth.service');

/**
 * Shared login handler — same code path for both surfaces, only the
 * `clientType` differs. The split into webLogin/mobileLogin lives at
 * the route level (POST /auth/web/login vs /auth/mobile/login) so the
 * URL itself declares which surface is logging in.
 *
 * Falls back to the User-Agent header if the client doesn't send `deviceInfo`.
 * That gives us at least a hint of which device a refresh token belongs to,
 * useful for the future "list active sessions" endpoint.
 */
const handleLogin = (clientType) =>
  asyncHandler(async (req, res) => {
    const result = await authService.login({
      identifier: req.body.identifier,
      password: req.body.password,
      deviceInfo: req.body.deviceInfo || req.get('user-agent') || null,
      clientType,
    });

    res.json({
      success: true,
      data: result,
    });
  });

/** POST /auth/web/login — dashboard surface (admin, manager, company, AM). */
const webLogin = handleLogin('web');

/** POST /auth/mobile/login — mobile surface (supervisor). */
const mobileLogin = handleLogin('mobile');

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

/** PATCH /auth/me — self-service profile edit (name/phone/email/language). */
const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user.id, req.body);

  res.json({
    success: true,
    data: { user },
  });
});

/** POST /auth/me/change-password — change own password (revokes sessions). */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);

  res.json({
    success: true,
    data: { message: 'Password changed. Please log in again.' },
  });
});

/** DELETE /auth/me — soft-delete own account (requires password confirm). */
const deleteAccount = asyncHandler(async (req, res) => {
  await authService.deleteAccount(req.user.id, req.body);

  res.json({
    success: true,
    data: { message: 'Account deleted' },
  });
});

module.exports = {
  webLogin,
  mobileLogin,
  refresh,
  logout,
  me,
  updateMe,
  changePassword,
  deleteAccount,
};

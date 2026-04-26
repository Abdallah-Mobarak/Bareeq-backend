const { asyncHandler } = require('../../utils/asyncHandler');
const authService = require('./auth.service');

/**
 * POST /auth/login
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
  });

  res.json({
    success: true,
    data: result,
  });
});

module.exports = { login };

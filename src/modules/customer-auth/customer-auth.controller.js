const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-auth.service');

/**
 * POST /auth/customer/signup — request OTP.
 * The User row is NOT created yet; we just send an OTP to the email.
 */
const requestSignup = asyncHandler(async (req, res) => {
  const result = await service.requestSignup(req.body);
  res.json({
    success: true,
    data: {
      ...result,
      message: 'Verification code sent. Check your email.',
    },
  });
});

/**
 * POST /auth/customer/signup/verify — verify OTP and create the account.
 * On success the response shape matches /auth/mobile/login (auto-login).
 */
const verifySignup = asyncHandler(async (req, res) => {
  const result = await service.verifySignup({
    ...req.body,
    deviceInfo: req.body.deviceInfo || req.get('user-agent') || null,
  });
  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * POST /auth/customer/password-reset/request — issue a reset OTP if the
 * account exists. Always returns success (anti-enumeration).
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await service.requestPasswordReset(req.body);
  res.json({
    success: true,
    data: {
      ...result,
      message: 'If the email is registered, a reset code has been sent.',
    },
  });
});

/**
 * POST /auth/customer/password-reset/confirm — verify OTP, set new password.
 * Active sessions are revoked on success so a compromised device is logged out.
 */
const confirmPasswordReset = asyncHandler(async (req, res) => {
  const result = await service.confirmPasswordReset(req.body);
  res.json({
    success: true,
    data: {
      ...result,
      message: 'Password updated. Please log in with your new password.',
    },
  });
});

module.exports = {
  requestSignup,
  verifySignup,
  requestPasswordReset,
  confirmPasswordReset,
};

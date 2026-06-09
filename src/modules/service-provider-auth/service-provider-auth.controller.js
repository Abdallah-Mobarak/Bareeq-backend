const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./service-provider-auth.service');

const listServiceTypes = asyncHandler(async (req, res) => {
  const result = await service.listServiceTypes();
  res.json({ success: true, data: result });
});

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
  listServiceTypes,
  requestSignup,
  verifySignup,
  requestPasswordReset,
  confirmPasswordReset,
};

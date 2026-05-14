const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-profile.service');

const getProfile = asyncHandler(async (req, res) => {
  const result = await service.getProfile(req.user.id);
  res.json({ success: true, data: result });
});

const updateProfile = asyncHandler(async (req, res) => {
  const result = await service.updateProfile(req.user.id, req.body);
  res.json({ success: true, data: result });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changePassword(req.user.id, req.body);
  res.json({
    success: true,
    data: {
      message: 'Password changed. Please log in again on every device.',
    },
  });
});

module.exports = { getProfile, updateProfile, changePassword };

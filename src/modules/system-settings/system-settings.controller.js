const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./system-settings.service');

const getPublic = asyncHandler(async (req, res) => {
  const settings = await service.getPublic();
  res.json({ success: true, data: { settings } });
});

module.exports = { getPublic };

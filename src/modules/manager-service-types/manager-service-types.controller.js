const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./manager-service-types.service');

const list = asyncHandler(async (req, res) => {
  const items = await service.listServiceTypes();
  res.json({ success: true, data: { items } });
});

module.exports = { list };

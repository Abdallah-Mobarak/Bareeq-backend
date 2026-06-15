const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-users.service');

const lookup = asyncHandler(async (req, res) => {
  const result = await service.lookup(req.validatedQuery);
  res.json({ success: true, ...result });
});

module.exports = { lookup };

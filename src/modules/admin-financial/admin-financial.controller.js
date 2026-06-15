const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-financial.service');

const getSummary = asyncHandler(async (req, res) => {
  const result = await service.getSummary(req.validatedQuery);
  res.json({ success: true, data: result });
});

module.exports = { getSummary };

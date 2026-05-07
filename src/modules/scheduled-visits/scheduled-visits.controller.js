const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./scheduled-visits.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, data: result });
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary(req.validatedQuery);
  res.json({ success: true, data: result });
});

module.exports = { list, summary };

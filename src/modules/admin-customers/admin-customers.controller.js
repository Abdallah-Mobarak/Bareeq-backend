const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-customers.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getOne(req.params.id);
  res.json({ success: true, data: result });
});

const updateStatus = asyncHandler(async (req, res) => {
  const result = await service.updateStatus(req.params.id, req.body);
  res.json({ success: true, data: result });
});

module.exports = { list, getOne, updateStatus };

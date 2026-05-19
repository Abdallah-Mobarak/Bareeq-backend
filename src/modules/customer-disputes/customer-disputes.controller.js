const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-disputes.service');

const file = asyncHandler(async (req, res) => {
  const dispute = await service.fileDispute(req.user.id, req.body);
  res.status(201).json({ success: true, data: { dispute } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listMine(req.user.id, req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const dispute = await service.getMine(req.user.id, req.params.id);
  res.json({ success: true, data: { dispute } });
});

module.exports = { file, list, getOne };

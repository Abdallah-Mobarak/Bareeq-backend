const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-disputes.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listDisputes(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const dispute = await service.getDispute(req.params.id);
  res.json({ success: true, data: { dispute } });
});

const update = asyncHandler(async (req, res) => {
  const dispute = await service.updateDispute(req.params.id, req.user.id, req.body);
  res.json({ success: true, data: { dispute } });
});

module.exports = { list, getOne, update };

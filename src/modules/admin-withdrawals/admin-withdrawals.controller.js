const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-withdrawals.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getOne(req.params.id);
  res.json({ success: true, data: result });
});

const approve = asyncHandler(async (req, res) => {
  const result = await service.approve(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: result });
});

const reject = asyncHandler(async (req, res) => {
  const result = await service.reject(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: result });
});

module.exports = { list, getOne, approve, reject };

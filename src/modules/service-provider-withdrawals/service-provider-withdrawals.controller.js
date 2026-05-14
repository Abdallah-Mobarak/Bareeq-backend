const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./service-provider-withdrawals.service');

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.user.id, req.body);
  res.status(201).json({ success: true, data: result });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listMine(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getMine(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

const cancel = asyncHandler(async (req, res) => {
  const result = await service.cancel(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: result });
});

module.exports = { create, list, getOne, cancel };

const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-services.service');

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  res.status(201).json({ success: true, data: result });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getOne(req.params.id);
  res.json({ success: true, data: result });
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const updateCommission = asyncHandler(async (req, res) => {
  const result = await service.updateCommission(req.params.id, req.body);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, data: { message: 'Service deleted' } });
});

module.exports = { create, list, getOne, update, updateCommission, remove };

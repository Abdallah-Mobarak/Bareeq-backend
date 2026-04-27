const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./reasons.service');

const create = asyncHandler(async (req, res) => {
  const reason = await service.createReason(req.body);
  res.status(201).json({ success: true, data: { reason } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listReasons(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const reason = await service.getReason(req.params.id);
  res.json({ success: true, data: { reason } });
});

const update = asyncHandler(async (req, res) => {
  const reason = await service.updateReason(req.params.id, req.body);
  res.json({ success: true, data: { reason } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteReason(req.params.id);
  res.json({ success: true, data: { message: 'Reason deleted' } });
});

module.exports = { create, list, getOne, update, remove };

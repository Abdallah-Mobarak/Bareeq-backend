const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./regions.service');

const create = asyncHandler(async (req, res) => {
  const region = await service.createRegion(req.body);
  res.status(201).json({ success: true, data: { region } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listRegions(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const region = await service.getRegion(req.params.id);
  res.json({ success: true, data: { region } });
});

const update = asyncHandler(async (req, res) => {
  const region = await service.updateRegion(req.params.id, req.body);
  res.json({ success: true, data: { region } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteRegion(req.params.id);
  res.json({ success: true, data: { message: 'Region deleted' } });
});

module.exports = { create, list, getOne, update, remove };

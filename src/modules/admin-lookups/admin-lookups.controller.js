const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-lookups.service');

const create = asyncHandler(async (req, res) => {
  const lookup = await service.createLookup(req.body);
  res.status(201).json({ success: true, data: { lookup } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listLookups(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const lookup = await service.getLookup(req.params.id);
  res.json({ success: true, data: { lookup } });
});

const update = asyncHandler(async (req, res) => {
  const lookup = await service.updateLookup(req.params.id, req.body);
  res.json({ success: true, data: { lookup } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteLookup(req.params.id);
  res.json({ success: true, data: { message: 'Lookup deleted' } });
});

module.exports = { create, list, getOne, update, remove };

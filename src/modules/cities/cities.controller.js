const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./cities.service');

const create = asyncHandler(async (req, res) => {
  const city = await service.createCity(req.body);
  res.status(201).json({ success: true, data: { city } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listCities(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const city = await service.getCity(req.params.id);
  res.json({ success: true, data: { city } });
});

const update = asyncHandler(async (req, res) => {
  const city = await service.updateCity(req.params.id, req.body);
  res.json({ success: true, data: { city } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteCity(req.params.id);
  res.json({ success: true, data: { message: 'City deleted' } });
});

module.exports = { create, list, getOne, update, remove };

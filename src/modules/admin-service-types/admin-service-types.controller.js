const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-service-types.service');

const create = asyncHandler(async (req, res) => {
  const serviceType = await service.createServiceType(req.body);
  res.status(201).json({ success: true, data: { serviceType } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listServiceTypes(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const serviceType = await service.getServiceType(req.params.id);
  res.json({ success: true, data: { serviceType } });
});

const update = asyncHandler(async (req, res) => {
  const serviceType = await service.updateServiceType(req.params.id, req.body);
  res.json({ success: true, data: { serviceType } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteServiceType(req.params.id);
  res.json({ success: true, data: { message: 'Service type deleted' } });
});

module.exports = { create, list, getOne, update, remove };

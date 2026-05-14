const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-home.service');

const listCategories = asyncHandler(async (req, res) => {
  const result = await service.listCategories(req.validatedQuery);
  res.json({ success: true, ...result });
});

const listServices = asyncHandler(async (req, res) => {
  const result = await service.listServices(req.validatedQuery);
  res.json({ success: true, ...result });
});

const getServiceDetail = asyncHandler(async (req, res) => {
  const result = await service.getServiceDetail(req.params.id);
  res.json({ success: true, data: result });
});

module.exports = { listCategories, listServices, getServiceDetail };

const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./categories.service');

const create = asyncHandler(async (req, res) => {
  const category = await service.createCategory(req.body);
  res.status(201).json({ success: true, data: { category } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listCategories(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const category = await service.getCategory(req.params.id);
  res.json({ success: true, data: { category } });
});

const update = asyncHandler(async (req, res) => {
  const category = await service.updateCategory(req.params.id, req.body);
  res.json({ success: true, data: { category } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteCategory(req.params.id);
  res.json({ success: true, data: { message: 'Category deleted' } });
});

module.exports = { create, list, getOne, update, remove };

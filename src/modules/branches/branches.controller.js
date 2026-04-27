const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./branches.service');

const create = asyncHandler(async (req, res) => {
  const branch = await service.createBranch(req.body);
  res.status(201).json({ success: true, data: { branch } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listBranches(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const branch = await service.getBranch(req.params.id);
  res.json({ success: true, data: { branch } });
});

const update = asyncHandler(async (req, res) => {
  const branch = await service.updateBranch(req.params.id, req.body);
  res.json({ success: true, data: { branch } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteBranch(req.params.id);
  res.json({ success: true, data: { message: 'Branch deleted' } });
});

module.exports = { create, list, getOne, update, remove };

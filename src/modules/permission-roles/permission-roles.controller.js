const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./permission-roles.service');

const create = asyncHandler(async (req, res) => {
  const role = await service.createRole(req.body);
  res.status(201).json({ success: true, data: { role } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listRoles(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const role = await service.getRole(req.params.id);
  res.json({ success: true, data: { role } });
});

const update = asyncHandler(async (req, res) => {
  const role = await service.updateRole(req.params.id, req.body);
  res.json({ success: true, data: { role } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteRole(req.params.id);
  res.json({ success: true, data: { message: 'Permission role deleted' } });
});

module.exports = { create, list, getOne, update, remove };

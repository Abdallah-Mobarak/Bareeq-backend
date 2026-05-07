const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./accountant-managers.service');

const create = asyncHandler(async (req, res) => {
  const accountantManager = await service.createAccountantManager(req.body);
  res.status(201).json({ success: true, data: { accountantManager } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listAccountantManagers(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const accountantManager = await service.getAccountantManager(req.params.id);
  res.json({ success: true, data: { accountantManager } });
});

const update = asyncHandler(async (req, res) => {
  const accountantManager = await service.updateAccountantManager(req.params.id, req.body);
  res.json({ success: true, data: { accountantManager } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteAccountantManager(req.params.id);
  res.json({ success: true, data: { message: 'Accountant manager deleted' } });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changeAccountantManagerPassword(req.params.id, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password changed' } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const accountantManager = await service.updateAccountantManagerStatus(
    req.params.id,
    req.body.status,
  );
  res.json({ success: true, data: { accountantManager } });
});

module.exports = { create, list, getOne, update, remove, changePassword, updateStatus };

const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./companies.service');

const create = asyncHandler(async (req, res) => {
  const company = await service.createCompany(req.body);
  res.status(201).json({ success: true, data: { company } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listCompanies(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const company = await service.getCompany(req.params.id);
  res.json({ success: true, data: { company } });
});

const update = asyncHandler(async (req, res) => {
  const company = await service.updateCompany(req.params.id, req.body);
  res.json({ success: true, data: { company } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteCompany(req.params.id);
  res.json({ success: true, data: { message: 'Company deleted' } });
});

const updateLogin = asyncHandler(async (req, res) => {
  const company = await service.updateCompanyLogin(req.params.id, req.body);
  res.json({ success: true, data: { company } });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changeCompanyPassword(req.params.id, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password changed' } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const company = await service.updateCompanyStatus(req.params.id, req.body.status);
  res.json({ success: true, data: { company } });
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  updateLogin,
  changePassword,
  updateStatus,
};

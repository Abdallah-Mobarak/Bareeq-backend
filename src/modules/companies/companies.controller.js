const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const service = require('./companies.service');

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

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listAllCompaniesForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Companies',
    columns: [
      { header: 'Name (AR)', key: 'nameAr', width: 28 },
      { header: 'Name (EN)', key: 'nameEn', width: 28 },
      { header: 'Contact Email', key: 'contactEmail', width: 28 },
      { header: 'Contact Phone', key: 'contactPhone', width: 18 },
      { header: 'Login Email', key: (r) => r.loginUser?.email, width: 28 },
      { header: 'Login Phone', key: (r) => r.loginUser?.phone, width: 18 },
      { header: 'Login Status', key: (r) => r.loginUser?.status, width: 14 },
      {
        header: 'Created At',
        key: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null),
        width: 14,
      },
    ],
    rows,
  });
  xlsxResponse(res, buffer, `companies-${todayStamp()}.xlsx`);
});

module.exports = {
  list,
  getOne,
  update,
  remove,
  updateLogin,
  changePassword,
  updateStatus,
  exportXlsx,
};

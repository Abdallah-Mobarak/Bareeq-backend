const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const service = require('./admins.service');

const create = asyncHandler(async (req, res) => {
  const admin = await service.createAdmin(req.body);
  res.status(201).json({ success: true, data: { admin } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listAdmins(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const admin = await service.getAdmin(req.params.id);
  res.json({ success: true, data: { admin } });
});

const update = asyncHandler(async (req, res) => {
  const admin = await service.updateAdmin(req.params.id, req.body);
  res.json({ success: true, data: { admin } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteAdmin(req.params.id, req.user.id);
  res.json({ success: true, data: { message: 'Admin deleted' } });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changeAdminPassword(req.params.id, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password changed' } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const admin = await service.updateAdminStatus(req.params.id, req.body.status, req.user.id);
  res.json({ success: true, data: { admin } });
});

const me = asyncHandler(async (req, res) => {
  const admin = await service.getAdmin(req.user.id);
  res.json({ success: true, data: { admin } });
});

const updateMe = asyncHandler(async (req, res) => {
  const admin = await service.updateOwnProfile(req.user.id, req.body);
  res.json({ success: true, data: { admin } });
});

const changeMyPassword = asyncHandler(async (req, res) => {
  await service.changeOwnPassword(req.user.id, req.body);
  res.json({ success: true, data: { message: 'Password changed. Please log in again.' } });
});

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listAllAdminsForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Admins',
    columns: [
      { header: 'Name (AR)', key: 'nameAr', width: 28 },
      { header: 'Name (EN)', key: 'nameEn', width: 28 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Permission Role', key: (r) => r.permissionRole?.name, width: 22 },
      {
        header: 'Created At',
        key: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null),
        width: 14,
      },
    ],
    rows,
  });
  xlsxResponse(res, buffer, `admins-${todayStamp()}.xlsx`);
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  changePassword,
  updateStatus,
  me,
  updateMe,
  changeMyPassword,
  exportXlsx,
};

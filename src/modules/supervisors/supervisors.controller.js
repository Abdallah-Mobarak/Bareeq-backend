const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const service = require('./supervisors.service');

const create = asyncHandler(async (req, res) => {
  const supervisor = await service.createSupervisor(req.body);
  res.status(201).json({ success: true, data: { supervisor } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listSupervisors(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const supervisor = await service.getSupervisor(req.params.id);
  res.json({ success: true, data: { supervisor } });
});

const update = asyncHandler(async (req, res) => {
  const supervisor = await service.updateSupervisor(req.params.id, req.body);
  res.json({ success: true, data: { supervisor } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteSupervisor(req.params.id);
  res.json({ success: true, data: { message: 'Supervisor deleted' } });
});

const changePassword = asyncHandler(async (req, res) => {
  await service.changeSupervisorPassword(req.params.id, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password changed' } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const supervisor = await service.updateSupervisorStatus(req.params.id, req.body.status);
  res.json({ success: true, data: { supervisor } });
});

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listAllSupervisorsForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Supervisors',
    columns: [
      { header: 'Name (AR)', key: 'nameAr', width: 28 },
      { header: 'Name (EN)', key: 'nameEn', width: 28 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      {
        header: 'Created At',
        key: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null),
        width: 14,
      },
    ],
    rows,
  });
  xlsxResponse(res, buffer, `supervisors-${todayStamp()}.xlsx`);
});

module.exports = { create, list, getOne, update, remove, changePassword, updateStatus, exportXlsx };

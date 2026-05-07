const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
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

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listAllAccountantManagersForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Accountant Managers',
    columns: [
      { header: 'Name (AR)', key: 'nameAr', width: 28 },
      { header: 'Name (EN)', key: 'nameEn', width: 28 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Company', key: (r) => r.company?.nameAr, width: 28 },
      {
        header: 'Scope',
        key: (r) =>
          r.assignedToAllBranches
            ? 'All branches'
            : `Specific (${(r.assignedBranches || []).length})`,
        width: 18,
      },
      {
        header: 'Created At',
        key: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null),
        width: 14,
      },
    ],
    rows,
  });
  xlsxResponse(res, buffer, `accountant-managers-${todayStamp()}.xlsx`);
});

module.exports = { create, list, getOne, update, remove, changePassword, updateStatus, exportXlsx };

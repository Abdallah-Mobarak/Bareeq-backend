const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const managersService = require('./managers.service');

/**
 * POST /managers — admin only.
 */
const create = asyncHandler(async (req, res) => {
  const manager = await managersService.createManager(req.body);
  res.status(201).json({ success: true, data: { manager } });
});

/**
 * GET /managers — admin only. Paginated, searchable, filterable.
 */
const list = asyncHandler(async (req, res) => {
  // req.validatedQuery is set by validate(_, 'query') middleware
  // (Express 5 makes req.query read-only — see middlewares/validate.js)
  const result = await managersService.listManagers(req.validatedQuery);
  res.json({ success: true, data: result });
});

/**
 * GET /managers/:id — admin only.
 */
const getOne = asyncHandler(async (req, res) => {
  const manager = await managersService.getManager(req.params.id);
  res.json({ success: true, data: { manager } });
});

/**
 * PATCH /managers/:id — admin only. Profile fields only.
 */
const update = asyncHandler(async (req, res) => {
  const manager = await managersService.updateManager(req.params.id, req.body);
  res.json({ success: true, data: { manager } });
});

/**
 * DELETE /managers/:id — admin only. Soft delete + session revocation.
 */
const remove = asyncHandler(async (req, res) => {
  await managersService.deleteManager(req.params.id, req.user.id);
  res.json({ success: true, data: { message: 'Manager deleted' } });
});

/**
 * PATCH /managers/:id/password — admin only. Resets password and
 * revokes all the manager's active sessions.
 */
const changePassword = asyncHandler(async (req, res) => {
  await managersService.changeManagerPassword(req.params.id, req.body.newPassword);
  res.json({ success: true, data: { message: 'Password changed' } });
});

/**
 * PATCH /managers/:id/status — admin only.
 * Blocking also revokes sessions so the manager is logged out promptly.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const manager = await managersService.updateManagerStatus(req.params.id, req.body.status);
  res.json({ success: true, data: { manager } });
});

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await managersService.listAllManagersForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Managers',
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
  xlsxResponse(res, buffer, `managers-${todayStamp()}.xlsx`);
});

module.exports = { create, list, getOne, update, remove, changePassword, updateStatus, exportXlsx };

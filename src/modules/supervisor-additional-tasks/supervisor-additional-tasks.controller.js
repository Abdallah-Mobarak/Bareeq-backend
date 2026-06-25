const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./supervisor-additional-tasks.service');

const EXPORT_COLUMNS = [
  { header: 'Company', key: 'companyName', width: 24 },
  { header: 'Brand', key: 'brandName', width: 28 },
  { header: 'Address', key: 'address', width: 32 },
  { header: 'Location', key: 'location', width: 24 },
  { header: 'Visit Date', key: 'visitDate', width: 14 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Documentation', key: 'documentationStatus', width: 16 },
  { header: 'Assigned By', key: 'assignedBy', width: 24 },
  { header: 'Notes', key: 'notes', width: 32 },
];

/** GET /supervisor/additional-tasks — FRD §1.4.1 + §1.4.2 + §1.4.3 */
const listMyTasks = asyncHandler(async (req, res) => {
  const data = await service.listMyTasks(req.user.id, req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /supervisor/additional-tasks/:id — FRD §1.4.4 */
const getMyTaskDetail = asyncHandler(async (req, res) => {
  const data = await service.getMyTaskDetail(req.user.id, req.params.id);
  res.json({ success: true, data });
});

/** GET /supervisor/additional-tasks/export.xlsx — FRD §1.4.5 */
const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listMyTasksForExport(req.user.id, req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'My Additional Tasks',
    columns: EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `supervisor-additional-tasks-${todayStamp()}.xlsx`);
});

/** GET /supervisor/additional-tasks/export.pdf — FRD §1.4.5 */
const exportPdf = asyncHandler(async (req, res) => {
  const rows = await service.listMyTasksForExport(req.user.id, req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'My Additional Tasks',
    subtitle: `Total: ${rows.length} tasks`,
    columns: EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `supervisor-additional-tasks-${todayStamp()}.pdf`);
});

/** POST /supervisor/additional-tasks/:id/start — FRD §1.4.4.1 §2.2 */
const startTask = asyncHandler(async (req, res) => {
  const data = await service.startTask(req.user.id, req.params.id, req.body);
  res.json({ success: true, data });
});

/** POST /supervisor/additional-tasks/:id/complete — FRD §1.4.4.1 §2.4 */
const completeTask = asyncHandler(async (req, res) => {
  const data = await service.completeTask(req.user.id, req.params.id, req.body);
  res.json({ success: true, data });
});

/** POST /supervisor/additional-tasks/:id/final-closed — FRD §1.4.4.1 §2.1 */
const finalCloseTask = asyncHandler(async (req, res) => {
  const data = await service.finalCloseTask(req.user.id, req.params.id);
  res.json({ success: true, data });
});

/** POST /supervisor/additional-tasks/:id/not-implemented — FRD §1.4.4.1 §2.1 */
const notImplementTask = asyncHandler(async (req, res) => {
  const data = await service.notImplementTask(req.user.id, req.params.id, req.body);
  res.json({ success: true, data });
});

/** PATCH /supervisor/additional-tasks/:id/tasks/:taskCheckId — FRD §1.4.4.1 */
const toggleTask = asyncHandler(async (req, res) => {
  const data = await service.toggleTaskCheck(
    req.params.id,
    req.params.taskCheckId,
    req.user.id,
    req.body,
  );
  res.json({ success: true, data });
});

/** POST /supervisor/additional-tasks/:id/photos — FRD §1.4.4.1 (3-4 photos) */
const uploadPhotos = asyncHandler(async (req, res) => {
  const data = await service.addPhotos(req.params.id, req.user.id, req.files);
  res.json({ success: true, data });
});

/** DELETE /supervisor/additional-tasks/:id/photos/:photoId — §3.2 image edit */
const removePhoto = asyncHandler(async (req, res) => {
  const data = await service.deletePhoto(req.params.id, req.params.photoId, req.user.id);
  res.json({ success: true, data });
});

module.exports = {
  listMyTasks,
  getMyTaskDetail,
  exportXlsx,
  exportPdf,
  startTask,
  completeTask,
  finalCloseTask,
  notImplementTask,
  toggleTask,
  uploadPhotos,
  removePhoto,
};

const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./manager-monthly-sales.service');

const EXPORT_COLUMNS = [
  { header: 'Client', key: 'name', width: 28 },
  { header: 'Contract Type', key: 'contractType', width: 18 },
  { header: 'Statement', key: 'statement', width: 28 },
  { header: 'Website', key: 'website', width: 24 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Tax Type', key: 'taxType', width: 14 },
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Status', key: 'contractStatus', width: 16 },
  { header: 'Created By', key: 'createdBy', width: 24 },
  { header: 'Notes', key: 'notes', width: 32 },
];

/** POST /manager/clients — FRD §3.7.2 (create) */
const createClient = asyncHandler(async (req, res) => {
  const data = await service.createClient(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

/** GET /manager/clients — FRD §3.7.1 + §3.7.3 + §3.7.4 */
const listClients = asyncHandler(async (req, res) => {
  const data = await service.listClients(req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /manager/clients/:id — FRD §3.7.6 */
const getClient = asyncHandler(async (req, res) => {
  const data = await service.getClientById(req.params.id);
  res.json({ success: true, data });
});

/** PATCH /manager/clients/:id — FRD §3.7.2 (update) */
const updateClient = asyncHandler(async (req, res) => {
  const data = await service.updateClient(req.params.id, req.body);
  res.json({ success: true, data });
});

/** DELETE /manager/clients/:id — FRD §3.7.2 (delete = soft) */
const deleteClient = asyncHandler(async (req, res) => {
  await service.deleteClient(req.params.id);
  res.json({ success: true, data: { message: 'Client deleted' } });
});

/** GET /manager/clients/export.xlsx — FRD §3.7.5 */
const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listClientsForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Clients',
    columns: EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `manager-clients-${todayStamp()}.xlsx`);
});

/** GET /manager/clients/export.pdf — FRD §3.7.5 */
const exportPdf = asyncHandler(async (req, res) => {
  const rows = await service.listClientsForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Clients',
    subtitle: `Total: ${rows.length} clients`,
    columns: EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `manager-clients-${todayStamp()}.pdf`);
});

module.exports = {
  createClient,
  listClients,
  getClient,
  updateClient,
  deleteClient,
  exportXlsx,
  exportPdf,
};

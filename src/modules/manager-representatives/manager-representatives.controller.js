const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./manager-representatives.service');

const EXPORT_COLUMNS = [
  { header: 'Client', key: 'clientName', width: 26 },
  { header: 'Service (AR)', key: 'serviceTypeAr', width: 22 },
  { header: 'Service (EN)', key: 'serviceTypeEn', width: 22 },
  { header: 'Hourly Rate', key: 'hourlyRate', width: 14 },
  { header: '#Workers', key: 'numberOfWorkers', width: 10 },
  { header: '#Hours', key: 'numberOfHours', width: 10 },
  { header: 'Price', key: 'price', width: 14 },
  { header: 'Date', key: 'dateOfAgreement', width: 14 },
  { header: 'Customer Phone', key: 'customerPhoneNumber', width: 18 },
  { header: 'Created By', key: 'createdBy', width: 24 },
];

const createRepresentative = asyncHandler(async (req, res) => {
  const data = await service.createRepresentative(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

const listRepresentatives = asyncHandler(async (req, res) => {
  const data = await service.listRepresentatives(req.validatedQuery || {});
  res.json({ success: true, data });
});

const getRepresentative = asyncHandler(async (req, res) => {
  const data = await service.getRepresentativeById(req.params.id);
  res.json({ success: true, data });
});

const updateRepresentative = asyncHandler(async (req, res) => {
  const data = await service.updateRepresentative(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteRepresentative = asyncHandler(async (req, res) => {
  await service.deleteRepresentative(req.params.id);
  res.json({ success: true, data: { message: 'Representative deleted' } });
});

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listRepresentativesForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Representatives',
    columns: EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `manager-representatives-${todayStamp()}.xlsx`);
});

const exportPdf = asyncHandler(async (req, res) => {
  const rows = await service.listRepresentativesForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Representatives',
    subtitle: `Total: ${rows.length} agreements`,
    columns: EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `manager-representatives-${todayStamp()}.pdf`);
});

module.exports = {
  createRepresentative,
  listRepresentatives,
  getRepresentative,
  updateRepresentative,
  deleteRepresentative,
  exportXlsx,
  exportPdf,
};

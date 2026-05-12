const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./manager-car-case.service');

const EXPORT_COLUMNS = [
  { header: 'Supervisor', key: 'supervisor', width: 24 },
  { header: 'Area', key: 'area', width: 18 },
  { header: 'License Plate', key: 'licensePlate', width: 16 },
  { header: 'Vehicle Condition', key: 'vehicleCondition', width: 18 },
  { header: 'Oil Change Date', key: 'oilChangeDate', width: 16 },
  { header: 'Notes', key: 'notes', width: 32 },
];

const createCarCase = asyncHandler(async (req, res) => {
  const data = await service.createCarCase(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

const listCarCases = asyncHandler(async (req, res) => {
  const data = await service.listCarCases(req.validatedQuery || {});
  res.json({ success: true, data });
});

const getCarCase = asyncHandler(async (req, res) => {
  const data = await service.getCarCaseById(req.params.id);
  res.json({ success: true, data });
});

const updateCarCase = asyncHandler(async (req, res) => {
  const data = await service.updateCarCase(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteCarCase = asyncHandler(async (req, res) => {
  await service.deleteCarCase(req.params.id);
  res.json({ success: true, data: { message: 'Car case deleted' } });
});

const exportXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listCarCasesForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Car Cases',
    columns: EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `manager-car-cases-${todayStamp()}.xlsx`);
});

const exportPdf = asyncHandler(async (req, res) => {
  const rows = await service.listCarCasesForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Car Cases',
    subtitle: `Total: ${rows.length} cases`,
    columns: EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `manager-car-cases-${todayStamp()}.pdf`);
});

module.exports = {
  createCarCase,
  listCarCases,
  getCarCase,
  updateCarCase,
  deleteCarCase,
  exportXlsx,
  exportPdf,
};

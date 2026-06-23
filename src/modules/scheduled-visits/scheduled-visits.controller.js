const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const service = require('./scheduled-visits.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, data: result });
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary(req.validatedQuery);
  res.json({ success: true, data: result });
});

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// One instance lookup by visit order (V1..V4) on a serialized row.
const instance = (row, order) =>
  (row.instances || []).find((i) => i.visitOrder === order) || null;

/**
 * Column layout for the scheduled-visits .xlsx export. Each row is one
 * branch (one ScheduledVisit); the V1..V4 instances are flattened into
 * date + status column pairs so the sheet stays one row per branch —
 * matching the FE table layout (FRD §4.2.2.2.2).
 */
const EXPORT_COLUMNS = [
  { header: 'Year', key: 'year', width: 8 },
  { header: 'Month', key: 'month', width: 8 },
  { header: 'Supervisor (Ar)', key: (r) => r.supervisor?.nameAr, width: 22 },
  { header: 'Supervisor (En)', key: (r) => r.supervisor?.nameEn, width: 22 },
  { header: 'Supervisor Email', key: (r) => r.supervisor?.email, width: 26 },
  { header: 'Company', key: (r) => r.regionScheduling?.companyName, width: 24 },
  { header: 'Branch', key: (r) => r.regionScheduling?.branchName, width: 24 },
  { header: 'Category', key: (r) => r.regionScheduling?.categoryName, width: 18 },
  { header: 'Branch #', key: (r) => r.regionScheduling?.branchNumber, width: 14 },
  { header: 'City', key: (r) => r.regionScheduling?.city, width: 16 },
  { header: 'Region', key: (r) => r.regionScheduling?.region, width: 16 },
  { header: 'Code', key: (r) => r.regionScheduling?.code, width: 14 },
  { header: '#Visits', key: 'numberOfVisits', width: 10 },
  { header: 'First Visit', key: (r) => fmtDate(r.firstVisitDate), width: 14 },
  { header: 'V1 Date', key: (r) => fmtDate(instance(r, 1)?.scheduledDate), width: 14 },
  { header: 'V1 Status', key: (r) => instance(r, 1)?.status, width: 14 },
  { header: 'V2 Date', key: (r) => fmtDate(instance(r, 2)?.scheduledDate), width: 14 },
  { header: 'V2 Status', key: (r) => instance(r, 2)?.status, width: 14 },
  { header: 'V3 Date', key: (r) => fmtDate(instance(r, 3)?.scheduledDate), width: 14 },
  { header: 'V3 Status', key: (r) => instance(r, 3)?.status, width: 14 },
  { header: 'V4 Date', key: (r) => fmtDate(instance(r, 4)?.scheduledDate), width: 14 },
  { header: 'V4 Status', key: (r) => instance(r, 4)?.status, width: 14 },
];

/**
 * GET /scheduled-visits/export.xlsx
 * Honours the same filter query string as GET /scheduled-visits, but
 * ignores pagination — exports every branch that matches.
 */
const exportExcel = asyncHandler(async (req, res) => {
  const all = await service.list({ ...req.validatedQuery, page: 1, limit: 10000 });
  const buffer = await buildExcel({
    sheetName: 'Scheduled Visits',
    columns: EXPORT_COLUMNS,
    rows: all.items,
  });
  xlsxResponse(res, buffer, `scheduled-visits-${todayStamp()}.xlsx`);
});

module.exports = { list, summary, exportExcel };

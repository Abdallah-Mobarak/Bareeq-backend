const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./supervisor-schedule.service');
const reasonsService = require('../reasons/reasons.service');

/**
 * Shared column config for the Monthly Time Distribution export (FRD §1.3.3).
 * One row per (company × visit type); used by both .xlsx and .pdf.
 */
const PERFORMANCE_EXPORT_COLUMNS = [
  { header: 'Company', key: 'companyName', width: 30 },
  { header: 'Visit Type', key: 'visitType', width: 12 },
  { header: 'Visits', key: 'totalVisits', width: 10 },
  { header: 'Implemented', key: 'implemented', width: 14 },
  { header: 'Remaining', key: 'notVisited', width: 12 },
  { header: 'Final Closed', key: 'finalClosed', width: 14 },
  { header: 'Not Implemented', key: 'notImplemented', width: 16 },
  { header: 'Documented', key: 'documented', width: 14 },
  { header: 'Undocumented', key: 'undocumented', width: 14 },
  { header: 'Start Date', key: 'startDate', width: 14 },
  { header: 'End Date', key: 'endDate', width: 14 },
];

const summary = asyncHandler(async (req, res) => {
  const data = await service.myScheduleSummary(req.user.id, req.validatedQuery || {});
  res.json({ success: true, data });
});

const listBranches = asyncHandler(async (req, res) => {
  const data = await service.listMyBranches(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

const branchDetail = asyncHandler(async (req, res) => {
  const data = await service.getMyBranchDetail(req.user.id, req.params.id);
  res.json({ success: true, data });
});

/**
 * GET /supervisor/my-schedule/filter-options — distinct values for the mobile
 * filter dropdowns (Company / Branch / Category / Branch Number / City /
 * Region / Address). Always spans the supervisor's whole schedule.
 */
const filterOptions = asyncHandler(async (req, res) => {
  const data = await service.getMyFilterOptions(req.user.id);
  res.json({ success: true, data });
});

/**
 * GET /supervisor/not-implemented-reasons — the admin-managed reason list,
 * exposed read-only to supervisors for the "Not Implemented" picker
 * (FRD §1.2.3.1 / §1.4.4.1). Admin adds reasons via /reasons; supervisors
 * pick from them here.
 */
const notImplementedReasons = asyncHandler(async (req, res) => {
  const data = await reasonsService.listActiveReasons();
  res.json({ success: true, data });
});

/** GET /supervisor/stats — Monthly Time Distribution (FRD §1.3.1/§1.3.2). */
const stats = asyncHandler(async (req, res) => {
  const data = await service.getMyStats(req.user.id, req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /supervisor/stats/export.xlsx — FRD §1.3.3. */
const exportStatsXlsx = asyncHandler(async (req, res) => {
  const report = await service.buildPerformanceFlatRows(req.user.id, req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: `Stats ${report.year}-${String(report.month).padStart(2, '0')}`,
    columns: PERFORMANCE_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  xlsxResponse(
    res,
    buffer,
    `supervisor-stats-${report.year}-${String(report.month).padStart(2, '0')}.xlsx`,
  );
});

/** GET /supervisor/stats/export.pdf — same data, printable. */
const exportStatsPdf = asyncHandler(async (req, res) => {
  const report = await service.buildPerformanceFlatRows(req.user.id, req.validatedQuery || {});
  const o = report.overview;
  const buffer = await buildPdf({
    title: `Monthly Time Distribution — ${report.year}-${String(report.month).padStart(2, '0')}`,
    subtitle: `Branches: ${o.branches} • Visits: ${o.totalVisits} • Implemented: ${o.implemented} • Remaining: ${o.notVisited} • Days worked: ${o.daysWorked}`,
    columns: PERFORMANCE_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  pdfResponse(
    res,
    buffer,
    `supervisor-stats-${report.year}-${String(report.month).padStart(2, '0')}.pdf`,
  );
});

module.exports = {
  summary,
  listBranches,
  branchDetail,
  filterOptions,
  notImplementedReasons,
  stats,
  exportStatsXlsx,
  exportStatsPdf,
};

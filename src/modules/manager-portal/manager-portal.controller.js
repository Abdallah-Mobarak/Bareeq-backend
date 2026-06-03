const ExcelJS = require('exceljs');

const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./manager-portal.service');

/**
 * Shared column config for the implemented-branches exports —
 * identical headers across .xlsx and .pdf to keep the two files
 * interchangeable for the end user.
 */
const DAILY_VISITS_EXPORT_COLUMNS = [
  { header: 'Supervisor (AR)', key: (r) => r.supervisor?.nameAr, width: 24 },
  { header: 'Supervisor (EN)', key: (r) => r.supervisor?.nameEn, width: 24 },
  { header: 'Email', key: (r) => r.supervisor?.email, width: 24 },
  { header: 'Phone', key: (r) => r.supervisor?.phone, width: 18 },
  { header: 'Total Visits', key: 'totalVisits', width: 12 },
  { header: 'Implemented', key: 'implemented', width: 12 },
  { header: 'Remaining', key: 'remaining', width: 10 },
  { header: 'Start Work Date', key: 'startWorkDate', width: 16 },
  { header: 'End Work Date', key: 'endWorkDate', width: 16 },
  { header: 'Days Worked', key: 'daysWorked', width: 12 },
];

const ADDITIONAL_TASKS_EXPORT_COLUMNS = [
  { header: 'Supervisor', key: 'supervisor', width: 24 },
  { header: 'Company', key: 'companyName', width: 24 },
  { header: 'Brand', key: 'brandName', width: 28 },
  { header: 'Address', key: 'address', width: 32 },
  { header: 'Location', key: 'location', width: 24 },
  { header: 'Visit Date', key: 'visitDate', width: 14 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Documentation', key: 'documentationStatus', width: 16 },
  { header: 'Notes', key: 'notes', width: 32 },
];

const CUSTOMERS_EXPORT_COLUMNS = [
  { header: 'Company', key: 'companyName', width: 28 },
  { header: '#Branches', key: 'branchCount', width: 10 },
  { header: 'Total Visits', key: 'totalVisits', width: 12 },
  { header: 'Implemented', key: 'implemented', width: 12 },
  { header: 'Remaining', key: 'remaining', width: 10 },
  { header: 'Not Implemented', key: 'notImplemented', width: 16 },
  { header: 'Final Closed', key: 'finalClosed', width: 12 },
  { header: 'Documented', key: 'documented', width: 12 },
  { header: 'Undocumented', key: 'undocumented', width: 14 },
];

const REPORT_BY_COMPANY_EXPORT_COLUMNS = [
  { header: 'Company', key: 'companyName', width: 24 },
  { header: 'Brand', key: 'brandName', width: 30 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'Visit Type', key: 'visitType', width: 10 },
  { header: 'Total', key: 'total', width: 8 },
  { header: 'Implemented', key: 'implemented', width: 12 },
  { header: 'Remaining', key: 'remaining', width: 10 },
  { header: 'Documented', key: 'documented', width: 12 },
  { header: 'Undocumented', key: 'undocumented', width: 14 },
];

const TEAMS_EXPORT_COLUMNS = [
  { header: 'Supervisor (AR)', key: (r) => r.supervisor?.nameAr, width: 22 },
  { header: 'Supervisor (EN)', key: (r) => r.supervisor?.nameEn, width: 22 },
  { header: 'Email', key: (r) => r.supervisor?.email, width: 24 },
  { header: 'Phone', key: (r) => r.supervisor?.phone, width: 18 },
  { header: 'Company', key: 'companyName', width: 26 },
  { header: 'Cities', key: (r) => (r.cities || []).join(', '), width: 22 },
  { header: 'Regions', key: (r) => (r.regions || []).join(', '), width: 22 },
  { header: '#Branches', key: 'totalBranches', width: 10 },
  { header: 'Total Visits', key: 'totalVisits', width: 12 },
  { header: 'Implemented', key: 'implemented', width: 12 },
  { header: 'Remaining', key: 'remaining', width: 10 },
  { header: 'Not Implemented', key: 'notImplemented', width: 16 },
  { header: 'Final Closed', key: 'finalClosed', width: 12 },
  { header: 'Documented', key: 'documented', width: 12 },
  { header: 'Undocumented', key: 'undocumented', width: 14 },
];

/**
 * Columns for the Regional Reports table inside the Overview export.
 * Same shape for .xlsx and .pdf, with the completion rate rendered as
 * "NN%" — the service returns it as an integer percent.
 */
const OVERVIEW_REGIONAL_COLUMNS = [
  { header: 'Region', key: 'region', width: 22 },
  { header: 'Branches', key: 'branchCount', width: 12 },
  { header: 'Scheduled', key: 'scheduled', width: 12 },
  { header: 'Implemented', key: 'implemented', width: 12 },
  { header: 'Unimplemented', key: 'unimplemented', width: 14 },
  { header: 'Completion', key: 'completionRate', width: 12, format: (v) => `${v}%` },
];

/**
 * Build the .xlsx workbook for /reports/overview/export.xlsx.
 *
 * Goes around buildExcel because the file needs a KPI block above the
 * regional table — the shared helper is designed for table-only exports
 * and starts the header row at row 1. Kept in this module (not promoted
 * to excelExport.js) because it's a single caller; extending the shared
 * helper for one consumer would add the wrong kind of abstraction.
 */
const buildOverviewWorkbook = async ({ summary, regional }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bareeq';
  workbook.created = new Date();

  const period = `${summary.year}-${String(summary.month).padStart(2, '0')}`;
  const sheet = workbook.addWorksheet(`Overview ${period}`);

  // Section A — title + KPI block. Two columns: label | value.
  sheet.columns = [{ width: 24 }, { width: 22 }];
  sheet.addRow([`Overview — ${period}`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  const kpiHeader = sheet.addRow(['SUMMARY']);
  kpiHeader.font = { bold: true };
  sheet.addRow(['Region Filter', regional.filterRegion || 'All']);
  sheet.addRow(['Total Branches', summary.branchCount]);
  sheet.addRow(['Scheduled', summary.scheduled]);
  sheet.addRow(['Implemented', summary.implemented]);
  sheet.addRow(['Unimplemented', summary.unimplemented]);
  sheet.addRow(['Completion Rate', `${summary.completionRate}%`]);
  sheet.addRow([]);

  // Section B — regional breakdown. Switching column widths mid-sheet
  // (only the next header row honours new widths visually in ExcelJS;
  // we set them on the cells directly via column iteration).
  const tableHeaderRow = sheet.addRow(['REGIONAL BREAKDOWN']);
  tableHeaderRow.font = { bold: true };
  const headerRow = sheet.addRow(OVERVIEW_REGIONAL_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true };
  OVERVIEW_REGIONAL_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(sheet.getColumn(i + 1).width || 0, c.width);
  });

  for (const r of regional.rows) {
    sheet.addRow(
      OVERVIEW_REGIONAL_COLUMNS.map((c) => {
        const raw = typeof c.key === 'function' ? c.key(r) : r[c.key];
        return c.format ? c.format(raw, r) : (raw ?? '—');
      }),
    );
  }

  return workbook.xlsx.writeBuffer();
};

const BRANCHES_EXPORT_COLUMNS = [
  { header: 'Company', key: 'companyName', width: 24 },
  { header: 'Brand', key: 'brandName', width: 30 },
  { header: 'Branch #', key: 'branchNumber', width: 12 },
  { header: 'Supervisor', key: 'supervisor', width: 24 },
  { header: 'Visit Date', key: 'visitDate', width: 12 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'Region', key: 'region', width: 16 },
  { header: 'Address', key: 'address', width: 24 },
  { header: '#Visits', key: 'numberOfVisits', width: 8 },
  { header: 'Code', key: 'code', width: 12 },
  { header: 'Visit Types', key: 'visitTypes', width: 16 },
  { header: 'Statuses', key: 'statuses', width: 36 },
];

/**
 * GET /manager/my-profile — FRD §3.1.
 */
const myProfile = asyncHandler(async (req, res) => {
  const data = await service.getMyProfile(req.user.id);
  res.json({ success: true, data });
});

/**
 * GET /manager/teams — FRD §3.2.1 / §3.2.2 / §3.2.3.
 * Returns one row per (supervisor × company) with visit / documentation
 * counters for the requested month (defaults to the current month).
 */
const listTeams = asyncHandler(async (req, res) => {
  const data = await service.listTeams(req.validatedQuery || {});
  res.json({ success: true, data });
});

/**
 * GET /manager/teams/export.xlsx — FRD §3.2.4.
 * Supports `?ids=` to export a single row, multiple rows, or omit to
 * export the full filtered list.
 */
const exportTeamsXlsx = asyncHandler(async (req, res) => {
  const data = await service.listTeamsForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: `Teams ${data.year}-${String(data.month).padStart(2, '0')}`,
    columns: TEAMS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  xlsxResponse(
    res,
    buffer,
    `manager-teams-${data.year}-${String(data.month).padStart(2, '0')}.xlsx`,
  );
});

/**
 * GET /manager/teams/export.pdf — FRD §3.2.4.
 */
const exportTeamsPdf = asyncHandler(async (req, res) => {
  const data = await service.listTeamsForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: `Teams — ${data.year}-${String(data.month).padStart(2, '0')}`,
    subtitle: `Rows: ${data.rowCount}`,
    columns: TEAMS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  pdfResponse(
    res,
    buffer,
    `manager-teams-${data.year}-${String(data.month).padStart(2, '0')}.pdf`,
  );
});

/**
 * GET /manager/branches — FRD §3.5.1.
 * Paginated list with search + filters; defaults to current month.
 */
const listBranches = asyncHandler(async (req, res) => {
  const data = await service.listBranches(req.validatedQuery);
  res.json({ success: true, data });
});

/**
 * GET /manager/branches/:id — FRD §3.5.6 (refers to §2.2.5 shape).
 */
const branchDetail = asyncHandler(async (req, res) => {
  const data = await service.getBranchDetail(req.params.id);
  res.json({ success: true, data });
});

/**
 * GET /manager/branches/export.xlsx — FRD §3.5.5.
 */
const exportBranchesXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listBranchesForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Implemented Branches',
    columns: BRANCHES_EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `manager-branches-${todayStamp()}.xlsx`);
});

/**
 * GET /manager/branches/export.pdf — FRD §3.5.5.
 */
const exportBranchesPdf = asyncHandler(async (req, res) => {
  const rows = await service.listBranchesForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Implemented Branches',
    subtitle: `Total: ${rows.length} branches`,
    columns: BRANCHES_EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `manager-branches-${todayStamp()}.pdf`);
});

/**
 * GET /manager/branches/photos.zip — FRD §3.5.2 / §4.6.2.
 *
 * Streams the archive directly to the response — the service sets
 * its own Content-Type / Content-Disposition headers and pipes the
 * archive into `res`, so this handler is intentionally tiny.
 *
 * `req.validatedQuery` carries `companyName` (required), optional
 * `visitType` / `year` / `month`.
 */
const downloadBranchPhotosZip = asyncHandler(async (req, res) => {
  await service.streamBranchPhotosZip(req.validatedQuery || {}, res);
});

/**
 * GET /manager/reports/by-company — FRD §3.6.1.
 * Returns the full per-company → per-branch breakdown plus company-level
 * and grand totals (visits, implemented, remaining, documented, undocumented).
 */
const reportByCompany = asyncHandler(async (req, res) => {
  const data = await service.getMonthlyReportByCompany(req.validatedQuery || {});
  res.json({ success: true, data });
});

/**
 * GET /manager/reports/by-company/export.xlsx — FRD §3.6.3.
 * Flat shape: one row per (company × brand × V).
 */
const exportReportByCompanyXlsx = asyncHandler(async (req, res) => {
  const report = await service.buildMonthlyReportByCompanyFlatRows(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: `Report ${report.year}-${String(report.month).padStart(2, '0')}`,
    columns: REPORT_BY_COMPANY_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  xlsxResponse(
    res,
    buffer,
    `manager-companies-report-${report.year}-${String(report.month).padStart(2, '0')}.xlsx`,
  );
});

/**
 * GET /manager/reports/by-company/export.pdf — FRD §3.6.3.
 * Same flat data as the xlsx, with grand totals printed in the subtitle.
 */
const exportReportByCompanyPdf = asyncHandler(async (req, res) => {
  const report = await service.buildMonthlyReportByCompanyFlatRows(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: `Companies Monthly Report — ${report.year}-${String(report.month).padStart(2, '0')}`,
    subtitle: `Companies: ${report.companyCount} • Branches: ${report.totalBranches} • Visits: ${report.totals.all.total} • Implemented: ${report.totals.all.implemented} • Documented: ${report.totals.all.documented}`,
    columns: REPORT_BY_COMPANY_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  pdfResponse(
    res,
    buffer,
    `manager-companies-report-${report.year}-${String(report.month).padStart(2, '0')}.pdf`,
  );
});

/**
 * GET /manager/customers — FRD §3.4.1.
 * One row per company with mutually exclusive status counters.
 */
const listCustomers = asyncHandler(async (req, res) => {
  const data = await service.listCustomers(req.validatedQuery || {});
  res.json({ success: true, data });
});

/**
 * GET /manager/customers/export.xlsx — FRD §3.4.4.
 */
const exportCustomersXlsx = asyncHandler(async (req, res) => {
  const data = await service.listCustomers(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: `Customers ${data.year}-${String(data.month).padStart(2, '0')}`,
    columns: CUSTOMERS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  xlsxResponse(
    res,
    buffer,
    `manager-customers-${data.year}-${String(data.month).padStart(2, '0')}.xlsx`,
  );
});

/**
 * GET /manager/customers/export.pdf — FRD §3.4.4.
 */
const exportCustomersPdf = asyncHandler(async (req, res) => {
  const data = await service.listCustomers(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: `Customers — ${data.year}-${String(data.month).padStart(2, '0')}`,
    subtitle: `Customers: ${data.totals.customerCount} • Branches: ${data.totals.branchCount} • Visits: ${data.totals.totalVisits} • Implemented: ${data.totals.implemented}`,
    columns: CUSTOMERS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  pdfResponse(
    res,
    buffer,
    `manager-customers-${data.year}-${String(data.month).padStart(2, '0')}.pdf`,
  );
});

/**
 * GET /manager/daily-visits — FRD §3.3.1.
 * One row per supervisor with computed work-date fields.
 */
const listDailyVisits = asyncHandler(async (req, res) => {
  const data = await service.listDailyVisits(req.validatedQuery || {});
  res.json({ success: true, data });
});

/**
 * GET /manager/daily-visits/export.xlsx — FRD §3.3.4.
 */
const exportDailyVisitsXlsx = asyncHandler(async (req, res) => {
  const data = await service.listDailyVisits(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Daily Visits',
    columns: DAILY_VISITS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  xlsxResponse(res, buffer, `manager-daily-visits-${data.startDate}_${data.endDate}.xlsx`);
});

/**
 * GET /manager/daily-visits/export.pdf — FRD §3.3.4.
 */
const exportDailyVisitsPdf = asyncHandler(async (req, res) => {
  const data = await service.listDailyVisits(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Daily Visits',
    subtitle: `${data.startDate} → ${data.endDate} • Supervisors: ${data.rowCount}`,
    columns: DAILY_VISITS_EXPORT_COLUMNS,
    rows: data.rows,
  });
  pdfResponse(res, buffer, `manager-daily-visits-${data.startDate}_${data.endDate}.pdf`);
});

/** GET /manager/reports/summary — FRD §3.12.1 */
const overallSummary = asyncHandler(async (req, res) => {
  const data = await service.getOverallSummary(req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /manager/reports/regional — FRD §3.12.2 */
const regionalReport = asyncHandler(async (req, res) => {
  const data = await service.getRegionalReport(req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /manager/reports/analysis — FRD §3.12.3 */
const monthlyAnalysis = asyncHandler(async (req, res) => {
  const data = await service.getMonthlyAnalysis(req.validatedQuery || {});
  res.json({ success: true, data });
});

/**
 * GET /manager/reports/overview/export.xlsx — Dashboard Export button.
 * Not in the FRD §3.12 spec literally, but the Dashboard UI has an
 * Export button that needs one file with the summary KPIs on top and
 * the regional breakdown as a table below.
 */
const exportOverviewXlsx = asyncHandler(async (req, res) => {
  const data = await service.getOverviewExport(req.validatedQuery || {});
  const buffer = await buildOverviewWorkbook(data);
  const period = `${data.summary.year}-${String(data.summary.month).padStart(2, '0')}`;
  xlsxResponse(res, buffer, `manager-overview-${period}.xlsx`);
});

/**
 * GET /manager/reports/overview/export.pdf — Dashboard Export button.
 *
 * KPIs go in the subtitle so we can reuse buildPdf as-is — pdfkit lays
 * out a multi-line subtitle automatically. Same trick as the existing
 * exportReportByCompanyPdf, which puts grand totals in the subtitle.
 */
const exportOverviewPdf = asyncHandler(async (req, res) => {
  const { summary, regional } = await service.getOverviewExport(req.validatedQuery || {});
  const period = `${summary.year}-${String(summary.month).padStart(2, '0')}`;
  const subtitle = [
    `Region: ${regional.filterRegion || 'All'}`,
    `Branches: ${summary.branchCount} • Scheduled: ${summary.scheduled} • Implemented: ${summary.implemented} • Unimplemented: ${summary.unimplemented} • Completion: ${summary.completionRate}%`,
  ].join('\n');
  const buffer = await buildPdf({
    title: `Overview — ${period}`,
    subtitle,
    columns: OVERVIEW_REGIONAL_COLUMNS,
    rows: regional.rows,
  });
  pdfResponse(res, buffer, `manager-overview-${period}.pdf`);
});

/** POST /manager/additional-tasks — FRD §3.9.2 (create) */
const createAdditionalTask = asyncHandler(async (req, res) => {
  const data = await service.createAdditionalTask(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

/** GET /manager/additional-tasks — FRD §3.9.1 + §3.9.3 + §3.9.4 */
const listAdditionalTasks = asyncHandler(async (req, res) => {
  const data = await service.listAdditionalTasks(req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /manager/additional-tasks/:id — FRD §3.9.6 */
const getAdditionalTask = asyncHandler(async (req, res) => {
  const data = await service.getAdditionalTaskById(req.params.id);
  res.json({ success: true, data });
});

/** PATCH /manager/additional-tasks/:id — FRD §3.9.2 (update) */
const updateAdditionalTask = asyncHandler(async (req, res) => {
  const data = await service.updateAdditionalTask(req.params.id, req.body);
  res.json({ success: true, data });
});

/** DELETE /manager/additional-tasks/:id — FRD §3.9.2 (delete = soft) */
const deleteAdditionalTask = asyncHandler(async (req, res) => {
  await service.deleteAdditionalTask(req.params.id);
  res.json({ success: true, data: { message: 'Task deleted' } });
});

/** GET /manager/additional-tasks/export.xlsx — FRD §3.9.5 */
const exportAdditionalTasksXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listAdditionalTasksForExport(req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Additional Tasks',
    columns: ADDITIONAL_TASKS_EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `manager-additional-tasks-${todayStamp()}.xlsx`);
});

/** GET /manager/additional-tasks/export.pdf — FRD §3.9.5 */
const exportAdditionalTasksPdf = asyncHandler(async (req, res) => {
  const rows = await service.listAdditionalTasksForExport(req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Additional Tasks',
    subtitle: `Total: ${rows.length} tasks`,
    columns: ADDITIONAL_TASKS_EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `manager-additional-tasks-${todayStamp()}.pdf`);
});

module.exports = {
  myProfile,
  listTeams,
  exportTeamsXlsx,
  exportTeamsPdf,
  listBranches,
  branchDetail,
  exportBranchesXlsx,
  exportBranchesPdf,
  downloadBranchPhotosZip,
  reportByCompany,
  exportReportByCompanyXlsx,
  exportReportByCompanyPdf,
  listCustomers,
  exportCustomersXlsx,
  exportCustomersPdf,
  listDailyVisits,
  exportDailyVisitsXlsx,
  exportDailyVisitsPdf,
  overallSummary,
  regionalReport,
  monthlyAnalysis,
  exportOverviewXlsx,
  exportOverviewPdf,
  createAdditionalTask,
  listAdditionalTasks,
  getAdditionalTask,
  updateAdditionalTask,
  deleteAdditionalTask,
  exportAdditionalTasksXlsx,
  exportAdditionalTasksPdf,
};

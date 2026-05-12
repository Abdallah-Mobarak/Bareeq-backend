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
  listBranches,
  branchDetail,
  exportBranchesXlsx,
  exportBranchesPdf,
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
  createAdditionalTask,
  listAdditionalTasks,
  getAdditionalTask,
  updateAdditionalTask,
  deleteAdditionalTask,
  exportAdditionalTasksXlsx,
  exportAdditionalTasksPdf,
};

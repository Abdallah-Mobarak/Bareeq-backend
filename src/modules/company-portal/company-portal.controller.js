const { asyncHandler } = require('../../utils/asyncHandler');
const { buildExcel, xlsxResponse, todayStamp } = require('../../utils/excelExport');
const { buildPdf, pdfResponse } = require('../../utils/pdfExport');
const service = require('./company-portal.service');

/**
 * Shared column config for branches list exports — used by both the
 * .xlsx and .pdf endpoints so they render identical content. Built
 * once, exported never, kept private to this module.
 */
const BRANCHES_EXPORT_COLUMNS = [
  { header: 'Brand', key: 'brandName', width: 32 },
  { header: 'Branch #', key: 'branchNumber', width: 14 },
  { header: 'Visit Date', key: 'visitDate', width: 14 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'Region', key: 'region', width: 18 },
  { header: 'Address', key: 'address', width: 28 },
  { header: 'Location', key: 'location', width: 24 },
  { header: '#Visits', key: 'numberOfVisits', width: 10 },
  { header: 'Code', key: 'code', width: 14 },
  { header: 'Visit Types', key: 'visitTypes', width: 18 },
  { header: 'Statuses', key: 'statuses', width: 40 },
];

const MONTHLY_REPORT_EXPORT_COLUMNS = [
  { header: 'Brand', key: 'brandName', width: 32 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'Visit Type', key: 'visitType', width: 12 },
  { header: 'Total', key: 'total', width: 10 },
  { header: 'Implemented', key: 'implemented', width: 14 },
  { header: 'Remaining', key: 'remaining', width: 12 },
];

/**
 * GET /company/my-profile
 * Returns the profile of the authenticated COMPANY_USER or ACCOUNTANT_MANAGER.
 * Shape differs slightly per role — see service docs.
 *
 * FRD §2.1 (Companies — Profile Management)
 * FRD FR-7 (Accountant Manager — Profile)
 */
const myProfile = asyncHandler(async (req, res) => {
  const data = await service.getMyProfile(req.user.id);
  res.json({ success: true, data });
});

/**
 * GET /company/branches
 * Paginated list of the branches the authenticated user is allowed to
 * see in the given month, with search/filter and per-visit status.
 *
 * FRD §2.2.1 (Companies — Branches Listing)
 * FRD §2.2.2 (Search) / §2.2.3 (Filters)
 * FRD FR-19 → FR-34 (Accountant Manager — scoped variant)
 */
const listBranches = asyncHandler(async (req, res) => {
  const data = await service.listMyBranches(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

/**
 * GET /company/branches/:id
 * Full branch + per-visit detail (status, photos, tasks, documentation).
 * Returns 404 if the id isn't in the caller's scope (object-capability
 * pattern — we don't differentiate "not yours" from "doesn't exist").
 *
 * FRD §2.2.5 (Companies — View Branch Details)
 * FRD FR-39 → FR-48 (Accountant Manager — same view, scoped)
 */
const branchDetail = asyncHandler(async (req, res) => {
  const data = await service.getMyBranchDetail(req.user.id, req.params.id);
  res.json({ success: true, data });
});

/**
 * GET /company/monthly-report
 * Per-branch breakdown + grand totals for the given month.
 *
 * FRD §2.3 (Companies — Monthly Report)
 * FRD FR-49 → FR-55 (Accountant Manager — scoped variant)
 */
const monthlyReport = asyncHandler(async (req, res) => {
  const data = await service.getMyMonthlyReport(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

/**
 * GET /company/branches/export.xlsx — FRD §2.2.4 + FR-35 → FR-38.
 * Same query params and scoping as GET /company/branches; returns a
 * single-sheet workbook instead of paginated JSON.
 */
const exportBranchesXlsx = asyncHandler(async (req, res) => {
  const rows = await service.listMyBranchesForExport(req.user.id, req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: 'Branches',
    columns: BRANCHES_EXPORT_COLUMNS,
    rows,
  });
  xlsxResponse(res, buffer, `company-branches-${todayStamp()}.xlsx`);
});

/**
 * GET /company/branches/export.pdf — same source as the xlsx, formatted
 * as a printable A4 landscape table.
 */
const exportBranchesPdf = asyncHandler(async (req, res) => {
  const rows = await service.listMyBranchesForExport(req.user.id, req.validatedQuery || {});
  const buffer = await buildPdf({
    title: 'Company Branches',
    subtitle: `Total: ${rows.length} branches`,
    columns: BRANCHES_EXPORT_COLUMNS,
    rows,
  });
  pdfResponse(res, buffer, `company-branches-${todayStamp()}.pdf`);
});

/**
 * GET /company/monthly-report/export.xlsx — FRD §2.3.3 + FR-59 → FR-62.
 * Flattens the per-branch breakdown into one row per (brand × visit type)
 * so accountants can pivot / filter in Excel directly.
 */
const exportMonthlyReportXlsx = asyncHandler(async (req, res) => {
  const report = await service.buildMonthlyReportFlatRows(req.user.id, req.validatedQuery || {});
  const buffer = await buildExcel({
    sheetName: `Report ${report.year}-${String(report.month).padStart(2, '0')}`,
    columns: MONTHLY_REPORT_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  xlsxResponse(
    res,
    buffer,
    `company-monthly-report-${report.year}-${String(report.month).padStart(2, '0')}.xlsx`,
  );
});

/**
 * GET /company/monthly-report/export.pdf — same flat shape as the xlsx
 * but rendered as a printable PDF.
 */
const exportMonthlyReportPdf = asyncHandler(async (req, res) => {
  const report = await service.buildMonthlyReportFlatRows(req.user.id, req.validatedQuery || {});
  const buffer = await buildPdf({
    title: `Monthly Report — ${report.year}-${String(report.month).padStart(2, '0')}`,
    subtitle: `Branches: ${report.branchCount} • Visits: ${report.totals.all.total} • Implemented: ${report.totals.all.implemented} • Remaining: ${report.totals.all.remaining}`,
    columns: MONTHLY_REPORT_EXPORT_COLUMNS,
    rows: report.flatRows,
  });
  pdfResponse(
    res,
    buffer,
    `company-monthly-report-${report.year}-${String(report.month).padStart(2, '0')}.pdf`,
  );
});

/**
 * POST /company/contact
 * Submit a Contact-Us message from a COMPANY_USER or AM to admins.
 * FRD §2.4 + FR-63 → FR-68.
 *
 * Returns 201 + the persisted message. FR-67/68 ("user notified on
 * success/failure") is satisfied at the HTTP layer: a 201 IS the
 * success notification; a non-2xx response IS the failure signal.
 */
const submitContact = asyncHandler(async (req, res) => {
  const data = await service.submitContactMessage(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

/**
 * GET /company/contact/my-messages
 * Paginated history of the caller's own messages, newest first, with
 * any admin replies inlined.
 */
const listMyMessages = asyncHandler(async (req, res) => {
  const data = await service.listMyContactMessages(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

module.exports = {
  myProfile,
  listBranches,
  branchDetail,
  monthlyReport,
  exportBranchesXlsx,
  exportBranchesPdf,
  exportMonthlyReportXlsx,
  exportMonthlyReportPdf,
  submitContact,
  listMyMessages,
};

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./manager-portal.controller');
const {
  listTeamsQuerySchema,
  idParamSchema,
  listBranchesQuerySchema,
  downloadPhotosZipQuerySchema,
  reportByCompanyQuerySchema,
  listCustomersQuerySchema,
  listDailyVisitsQuerySchema,
  summaryQuerySchema,
  regionalQuerySchema,
  analysisQuerySchema,
  createAdditionalTaskSchema,
  updateAdditionalTaskSchema,
  listAdditionalTasksQuerySchema,
} = require('./manager-portal.validation');

const router = Router();

/**
 * Manager web portal — FRD §3 (manager view) AND FRD §4.3–§4.13
 * (admin view). The two roles see the same underlying data; per
 * FRD §4 the admin also sees a "Manager Name" column on the CRUD
 * lists, which our serialisers already include.
 *
 * Per-feature permissions for managers (via the dynamic
 * PermissionRole system) are layered on later; the role guard here
 * is the broad first line.
 *
 * NOTE on URL naming: `/manager/*` is misleading now that admin uses
 * these routes too. Acceptable interim — the alternative is renaming
 * to `/portal/*` which is a breaking change. Tracked as Sprint 3
 * cleanup.
 */
router.use(requireAuth, requireRole('MANAGER', 'ADMIN'));

/**
 * /my-profile is the only route that's truly manager-specific —
 * admins have their own profile via /auth/me. The route-level guard
 * overrides the broader allow-list above for ADMIN.
 */
router.get('/my-profile', requireRole('MANAGER'), controller.myProfile);

/**
 * Per-route permission keys come from the FRD §4.2.1.2 catalog
 * (seeded by scripts/seed-permissions.js). Every endpoint specifies
 * exactly one key; the bootstrap admin (no permissionRoleId) bypasses
 * the check, so a fresh-seed environment "just works" without anyone
 * losing access during the wire-up.
 */
router.get(
  '/teams',
  requirePermission('VIEW_TEAMS'),
  validate(listTeamsQuerySchema, 'query'),
  controller.listTeams,
);

/**
 * Teams export — FRD §3.2.4.
 * `?ids=` accepts the opaque row ids returned by /teams; omitting it
 * exports the full filtered list.
 */
router.get(
  '/teams/export.xlsx',
  requirePermission('EXPORT_TEAMS'),
  validate(listTeamsQuerySchema, 'query'),
  controller.exportTeamsXlsx,
);
router.get(
  '/teams/export.pdf',
  requirePermission('EXPORT_TEAMS'),
  validate(listTeamsQuerySchema, 'query'),
  controller.exportTeamsPdf,
);

/**
 * Implemented Branches Management — FRD §3.5.
 * Export routes MUST come BEFORE /branches/:id to avoid Express
 * matching `:id = "export.xlsx"`.
 */
router.get(
  '/branches',
  requirePermission('VIEW_IMPLEMENTED_BRANCHES'),
  validate(listBranchesQuerySchema, 'query'),
  controller.listBranches,
);
router.get(
  '/branches/export.xlsx',
  requirePermission('EXPORT_IMPLEMENTED_BRANCHES'),
  validate(listBranchesQuerySchema, 'query'),
  controller.exportBranchesXlsx,
);
router.get(
  '/branches/export.pdf',
  requirePermission('EXPORT_IMPLEMENTED_BRANCHES'),
  validate(listBranchesQuerySchema, 'query'),
  controller.exportBranchesPdf,
);

/**
 * Bulk store-photos download — FRD §3.5.2 / §4.6.2.
 * Streams a ZIP of every photo for all branches of the given
 * companyName, optionally narrowed to a single visit type.
 * Gated by the same permission as the regular branch exports.
 */
router.get(
  '/branches/photos.zip',
  requirePermission('EXPORT_IMPLEMENTED_BRANCHES'),
  validate(downloadPhotosZipQuerySchema, 'query'),
  controller.downloadBranchPhotosZip,
);
router.get(
  '/branches/:id',
  requirePermission('VIEW_IMPLEMENTED_BRANCHES'),
  validate(idParamSchema, 'params'),
  controller.branchDetail,
);

/**
 * Reports — FRD §3.6 (per-company) + §3.12 later (overall analytics).
 * All future report endpoints will be grouped under /manager/reports/* .
 */
router.get(
  '/reports/by-company',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(reportByCompanyQuerySchema, 'query'),
  controller.reportByCompany,
);
router.get(
  '/reports/by-company/export.xlsx',
  requirePermission('EXPORT_MONTHLY_REPORTS'),
  validate(reportByCompanyQuerySchema, 'query'),
  controller.exportReportByCompanyXlsx,
);
router.get(
  '/reports/by-company/export.pdf',
  requirePermission('EXPORT_MONTHLY_REPORTS'),
  validate(reportByCompanyQuerySchema, 'query'),
  controller.exportReportByCompanyPdf,
);

/**
 * Customer Tracking Management — FRD §3.4.
 * One row per company with full status breakdown.
 */
router.get(
  '/customers',
  requirePermission('VIEW_CUSTOMERS'),
  validate(listCustomersQuerySchema, 'query'),
  controller.listCustomers,
);
router.get(
  '/customers/export.xlsx',
  requirePermission('EXPORT_CUSTOMERS'),
  validate(listCustomersQuerySchema, 'query'),
  controller.exportCustomersXlsx,
);
router.get(
  '/customers/export.pdf',
  requirePermission('EXPORT_CUSTOMERS'),
  validate(listCustomersQuerySchema, 'query'),
  controller.exportCustomersPdf,
);

/**
 * Follow-Up & Manage Daily Visits — FRD §3.3.
 * Date range filter; defaults to "first of this month → today".
 */
router.get(
  '/daily-visits',
  requirePermission('VIEW_DAILY_VISITS'),
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.listDailyVisits,
);
router.get(
  '/daily-visits/export.xlsx',
  requirePermission('EXPORT_DAILY_VISITS'),
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.exportDailyVisitsXlsx,
);
router.get(
  '/daily-visits/export.pdf',
  requirePermission('EXPORT_DAILY_VISITS'),
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.exportDailyVisitsPdf,
);

/**
 * Overall Monthly Reports — FRD §3.12.
 * Three views over the same data: snapshot summary, per-region rows,
 * and a year-long monthly series for charts. All three gated by the
 * same VIEW_MONTHLY_REPORTS key — the FRD treats §3.12.1/2/3 as a
 * single "monthly reports" feature.
 */
router.get(
  '/reports/summary',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(summaryQuerySchema, 'query'),
  controller.overallSummary,
);
router.get(
  '/reports/regional',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(regionalQuerySchema, 'query'),
  controller.regionalReport,
);
router.get(
  '/reports/analysis',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(analysisQuerySchema, 'query'),
  controller.monthlyAnalysis,
);

/**
 * Additional Tasks — FRD §3.9.
 * Export routes BEFORE /:id (Express order trick).
 *
 * Read keys (VIEW_*) gate list + detail; MANAGE_* gates writes;
 * EXPORT_* gates the file endpoints. Matches the FRD §4.2.1.2
 * permission catalog exactly.
 */
router.get(
  '/additional-tasks',
  requirePermission('VIEW_ADDITIONAL_TASKS'),
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.listAdditionalTasks,
);
router.post(
  '/additional-tasks',
  requirePermission('MANAGE_ADDITIONAL_TASKS'),
  validate(createAdditionalTaskSchema),
  controller.createAdditionalTask,
);
router.get(
  '/additional-tasks/export.xlsx',
  requirePermission('EXPORT_ADDITIONAL_TASKS'),
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.exportAdditionalTasksXlsx,
);
router.get(
  '/additional-tasks/export.pdf',
  requirePermission('EXPORT_ADDITIONAL_TASKS'),
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.exportAdditionalTasksPdf,
);
router.get(
  '/additional-tasks/:id',
  requirePermission('VIEW_ADDITIONAL_TASK_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getAdditionalTask,
);
router.patch(
  '/additional-tasks/:id',
  requirePermission('MANAGE_ADDITIONAL_TASKS'),
  validate(idParamSchema, 'params'),
  validate(updateAdditionalTaskSchema),
  controller.updateAdditionalTask,
);
router.delete(
  '/additional-tasks/:id',
  requirePermission('MANAGE_ADDITIONAL_TASKS'),
  validate(idParamSchema, 'params'),
  controller.deleteAdditionalTask,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./manager-portal.controller');
const {
  listTeamsQuerySchema,
  idParamSchema,
  listBranchesQuerySchema,
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

router.get(
  '/teams',
  validate(listTeamsQuerySchema, 'query'),
  controller.listTeams,
);

/**
 * Implemented Branches Management — FRD §3.5.
 * Export routes MUST come BEFORE /branches/:id to avoid Express
 * matching `:id = "export.xlsx"`.
 */
router.get(
  '/branches',
  validate(listBranchesQuerySchema, 'query'),
  controller.listBranches,
);
router.get(
  '/branches/export.xlsx',
  validate(listBranchesQuerySchema, 'query'),
  controller.exportBranchesXlsx,
);
router.get(
  '/branches/export.pdf',
  validate(listBranchesQuerySchema, 'query'),
  controller.exportBranchesPdf,
);
router.get(
  '/branches/:id',
  validate(idParamSchema, 'params'),
  controller.branchDetail,
);

/**
 * Reports — FRD §3.6 (per-company) + §3.12 later (overall analytics).
 * All future report endpoints will be grouped under /manager/reports/* .
 */
router.get(
  '/reports/by-company',
  validate(reportByCompanyQuerySchema, 'query'),
  controller.reportByCompany,
);
router.get(
  '/reports/by-company/export.xlsx',
  validate(reportByCompanyQuerySchema, 'query'),
  controller.exportReportByCompanyXlsx,
);
router.get(
  '/reports/by-company/export.pdf',
  validate(reportByCompanyQuerySchema, 'query'),
  controller.exportReportByCompanyPdf,
);

/**
 * Customer Tracking Management — FRD §3.4.
 * One row per company with full status breakdown.
 */
router.get(
  '/customers',
  validate(listCustomersQuerySchema, 'query'),
  controller.listCustomers,
);
router.get(
  '/customers/export.xlsx',
  validate(listCustomersQuerySchema, 'query'),
  controller.exportCustomersXlsx,
);
router.get(
  '/customers/export.pdf',
  validate(listCustomersQuerySchema, 'query'),
  controller.exportCustomersPdf,
);

/**
 * Follow-Up & Manage Daily Visits — FRD §3.3.
 * Date range filter; defaults to "first of this month → today".
 */
router.get(
  '/daily-visits',
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.listDailyVisits,
);
router.get(
  '/daily-visits/export.xlsx',
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.exportDailyVisitsXlsx,
);
router.get(
  '/daily-visits/export.pdf',
  validate(listDailyVisitsQuerySchema, 'query'),
  controller.exportDailyVisitsPdf,
);

/**
 * Overall Monthly Reports — FRD §3.12.
 * Three views over the same data: snapshot summary, per-region rows,
 * and a year-long monthly series for charts.
 */
router.get(
  '/reports/summary',
  validate(summaryQuerySchema, 'query'),
  controller.overallSummary,
);
router.get(
  '/reports/regional',
  validate(regionalQuerySchema, 'query'),
  controller.regionalReport,
);
router.get(
  '/reports/analysis',
  validate(analysisQuerySchema, 'query'),
  controller.monthlyAnalysis,
);

/**
 * Additional Tasks — FRD §3.9.
 * Export routes BEFORE /:id (Express order trick).
 */
router.get(
  '/additional-tasks',
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.listAdditionalTasks,
);
router.post(
  '/additional-tasks',
  validate(createAdditionalTaskSchema),
  controller.createAdditionalTask,
);
router.get(
  '/additional-tasks/export.xlsx',
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.exportAdditionalTasksXlsx,
);
router.get(
  '/additional-tasks/export.pdf',
  validate(listAdditionalTasksQuerySchema, 'query'),
  controller.exportAdditionalTasksPdf,
);
router.get(
  '/additional-tasks/:id',
  validate(idParamSchema, 'params'),
  controller.getAdditionalTask,
);
router.patch(
  '/additional-tasks/:id',
  validate(idParamSchema, 'params'),
  validate(updateAdditionalTaskSchema),
  controller.updateAdditionalTask,
);
router.delete(
  '/additional-tasks/:id',
  validate(idParamSchema, 'params'),
  controller.deleteAdditionalTask,
);

module.exports = router;

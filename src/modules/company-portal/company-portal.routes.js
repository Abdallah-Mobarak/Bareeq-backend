const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./company-portal.controller');
const {
  idParamSchema,
  dashboardQuerySchema,
  listBranchesQuerySchema,
  listAllBranchesQuerySchema,
  allBranchDetailQuerySchema,
  monthlyReportQuerySchema,
  submitContactSchema,
  listContactMessagesQuerySchema,
} = require('./company-portal.validation');

const router = Router();

/**
 * Company portal — read-only API for COMPANY_USER and ACCOUNTANT_MANAGER.
 *
 * FRD §2 (Companies — Mobile and Web Application) — both surfaces serve
 * the same routes. The `clientType` is enforced at /auth/{web,mobile}/login;
 * once a JWT is issued the surface is irrelevant.
 *
 * AM endpoints share the same paths as COMPANY_USER but the service
 * scopes the data automatically per FR-9 / FR-10.
 */
router.use(requireAuth, requireRole('COMPANY_USER', 'ACCOUNTANT_MANAGER'));

router.get('/my-profile', controller.myProfile);

/**
 * Home-screen summary + per-branch breakdown, scoped to the caller.
 * Optional ?dateFrom / ?dateTo (inclusive, on the visit's scheduledDate)
 * narrow every figure except totalBranches to that period.
 */
router.get(
  '/dashboard',
  validate(dashboardQuerySchema, 'query'),
  controller.dashboard,
);

/**
 * Same data as /dashboard, as a two-sheet .xlsx (Summary + Branches).
 * Mounted as a sibling literal path so there's no :id collision to guard.
 */
router.get(
  '/dashboard/export.xlsx',
  validate(dashboardQuerySchema, 'query'),
  controller.exportDashboardXlsx,
);

router.get(
  '/branches',
  validate(listBranchesQuerySchema, 'query'),
  controller.listBranches,
);

/**
 * Full branch catalogue (every imported branch for the company), NOT
 * scoped to a month and with no per-visit status. Separate path from
 * /branches so the existing month-scoped list stays untouched.
 */
router.get(
  '/all-branches',
  validate(listAllBranchesQuerySchema, 'query'),
  controller.listAllBranches,
);

/**
 * Full detail for one branch by RegionScheduling id. Mounted after the
 * bare /all-branches so the literal path wins; no export sub-paths here yet,
 * so :id needs no before-ordering tricks.
 */
router.get(
  '/all-branches/:id',
  validate(idParamSchema, 'params'),
  validate(allBranchDetailQuerySchema, 'query'),
  controller.allBranchDetail,
);

/**
 * Export routes MUST be mounted BEFORE the /branches/:id catch-all,
 * otherwise Express matches "/branches/export.xlsx" as :id="export.xlsx"
 * and returns 404 ("Branch not found"). Same trick as the admin
 * /companies module — see companies.routes.js for the original.
 */
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
  '/monthly-report',
  validate(monthlyReportQuerySchema, 'query'),
  controller.monthlyReport,
);
router.get(
  '/monthly-report/export.xlsx',
  validate(monthlyReportQuerySchema, 'query'),
  controller.exportMonthlyReportXlsx,
);
router.get(
  '/monthly-report/export.pdf',
  validate(monthlyReportQuerySchema, 'query'),
  controller.exportMonthlyReportPdf,
);

/**
 * Single-branch visit report as PDF (FRD §2.2.5 "Download PDF"). Mounted
 * before the bare /branches/:id so the literal ".../export.pdf" suffix is
 * matched by this handler, not swallowed as part of :id.
 */
router.get(
  '/branches/:id/export.pdf',
  validate(idParamSchema, 'params'),
  controller.exportBranchPdf,
);

router.get(
  '/branches/:id',
  validate(idParamSchema, 'params'),
  controller.branchDetail,
);

/**
 * Contact-Us (FRD §2.4 + FR-63 → FR-68).
 * POST submits a new message; GET pulls the caller's own history.
 * The path /contact/my-messages is a sibling of /contact (POST) so a
 * future /contact/:id endpoint can fit without colliding with the
 * fixed-string "my-messages".
 */
router.post(
  '/contact',
  validate(submitContactSchema),
  controller.submitContact,
);
router.get(
  '/contact/my-messages',
  validate(listContactMessagesQuerySchema, 'query'),
  controller.listMyMessages,
);

module.exports = router;

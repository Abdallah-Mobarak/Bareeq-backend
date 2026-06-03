const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./supervisor-schedule.controller');
const {
  listMyBranchesQuerySchema,
  idParamSchema,
  statsQuerySchema,
} = require('./supervisor-schedule.validation');

const router = Router();

router.use(requireAuth, requireRole('SUPERVISOR'));

router.get('/my-schedule', controller.summary);

/**
 * Admin-managed "Not Implemented" reason list, read-only for supervisors
 * (FRD §1.2.3.1 / §1.4.4.1). The picker on the mobile app loads from here.
 */
router.get('/not-implemented-reasons', controller.notImplementedReasons);

/**
 * Monthly Time Distribution — FRD §1.3. The "Performance" tab: overview KPIs
 * + per-company per-visit-type breakdown, with Excel/PDF export.
 * Export routes come before the bare /stats so the literal paths win.
 */
router.get(
  '/stats/export.xlsx',
  validate(statsQuerySchema, 'query'),
  controller.exportStatsXlsx,
);
router.get(
  '/stats/export.pdf',
  validate(statsQuerySchema, 'query'),
  controller.exportStatsPdf,
);
router.get('/stats', validate(statsQuerySchema, 'query'), controller.stats);

router.get(
  '/my-schedule/branches',
  validate(listMyBranchesQuerySchema, 'query'),
  controller.listBranches,
);

router.get(
  '/branches/:id',
  validate(idParamSchema, 'params'),
  controller.branchDetail,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');

/**
 * Admin Monthly Reports — FRD §4.13.
 *
 * §4.13.1 / §4.13.2 / §4.13.3 are textually identical to §3.12.1 / 2 / 3
 * (the manager equivalents). Rather than fork the aggregation logic,
 * this module is a thin wrapper that:
 *   - applies `requireRole('ADMIN')` (not MANAGER),
 *   - reuses the manager-portal controller + validation untouched.
 *
 * If admin and manager scopes ever diverge (e.g. tenant filtering),
 * fork the controller here and keep the manager copy free of admin
 * branching.
 */
const controller = require('../manager-portal/manager-portal.controller');
const {
  summaryQuerySchema,
  regionalQuerySchema,
  analysisQuerySchema,
} = require('../manager-portal/manager-portal.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get(
  '/summary',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(summaryQuerySchema, 'query'),
  controller.overallSummary,
);

router.get(
  '/regional',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(regionalQuerySchema, 'query'),
  controller.regionalReport,
);

router.get(
  '/analysis',
  requirePermission('VIEW_MONTHLY_REPORTS'),
  validate(analysisQuerySchema, 'query'),
  controller.monthlyAnalysis,
);

module.exports = router;

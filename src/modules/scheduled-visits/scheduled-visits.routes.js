const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./scheduled-visits.controller');
const {
  listScheduledVisitsQuerySchema,
  summaryQuerySchema,
} = require('./scheduled-visits.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// Order matters: /summary must come before any "/:id" route if we add one later.
router.get(
  '/summary',
  validate(summaryQuerySchema, 'query'),
  controller.summary,
);

router.get(
  '/',
  validate(listScheduledVisitsQuerySchema, 'query'),
  controller.list,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./supervisor-additional-tasks.controller');
const {
  idParamSchema,
  listMyTasksQuerySchema,
  startBodySchema,
  notImplementedBodySchema,
} = require('./supervisor-additional-tasks.validation');

const router = Router();

router.use(requireAuth, requireRole('SUPERVISOR'));

/**
 * Read endpoints. Export routes BEFORE /:id (Express order trick).
 */
router.get(
  '/',
  validate(listMyTasksQuerySchema, 'query'),
  controller.listMyTasks,
);
router.get(
  '/export.xlsx',
  validate(listMyTasksQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  validate(listMyTasksQuerySchema, 'query'),
  controller.exportPdf,
);
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  controller.getMyTaskDetail,
);

/**
 * State-transition endpoints.
 *
 *   /:id/start              REMAINING → UNDERWAY (body: lat/lng)
 *   /:id/complete           UNDERWAY → IMPLEMENTED (no body)
 *   /:id/final-closed       REMAINING → FINAL_CLOSED (no body)
 *   /:id/not-implemented    REMAINING/NOT_IMPLEMENTED → NOT_IMPLEMENTED (body: reasonText)
 */
router.post(
  '/:id/start',
  validate(idParamSchema, 'params'),
  validate(startBodySchema),
  controller.startTask,
);
router.post(
  '/:id/complete',
  validate(idParamSchema, 'params'),
  controller.completeTask,
);
router.post(
  '/:id/final-closed',
  validate(idParamSchema, 'params'),
  controller.finalCloseTask,
);
router.post(
  '/:id/not-implemented',
  validate(idParamSchema, 'params'),
  validate(notImplementedBodySchema),
  controller.notImplementTask,
);

module.exports = router;

const { Router } = require('express');

const Joi = require('joi');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const { visitPhotoUpload } = require('../../middlewares/uploadFile');
const controller = require('./supervisor-additional-tasks.controller');
const {
  idParamSchema,
  listMyTasksQuerySchema,
  startBodySchema,
  completeBodySchema,
  notImplementedBodySchema,
} = require('./supervisor-additional-tasks.validation');

const photoParamSchema = Joi.object({
  id: Joi.string().required(),
  photoId: Joi.string().required(),
});

const taskCheckParamSchema = Joi.object({
  id: Joi.string().required(),
  taskCheckId: Joi.string().required(),
});

const toggleTaskSchema = Joi.object({
  done: Joi.boolean().required(),
});

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
  validate(completeBodySchema),
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

/**
 * Required-task checklist — FRD §1.4.4.1. Toggle a task done/undone
 * while the visit is UNDERWAY.
 */
router.patch(
  '/:id/tasks/:taskCheckId',
  validate(taskCheckParamSchema, 'params'),
  validate(toggleTaskSchema),
  controller.toggleTask,
);

/**
 * Photos — FRD §1.4.4.1. Up to 4 images under the `photos` field
 * (JPEG / PNG / WebP, max 5MB each).
 */
router.post(
  '/:id/photos',
  validate(idParamSchema, 'params'),
  visitPhotoUpload,
  controller.uploadPhotos,
);
router.delete(
  '/:id/photos/:photoId',
  validate(photoParamSchema, 'params'),
  controller.removePhoto,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const { visitPhotoUpload } = require('../../middlewares/uploadFile');
const controller = require('./visit-instances.controller');
const {
  idParamSchema,
  taskCheckParamSchema,
  startSchema,
  finalClosedSchema,
  notImplementedSchema,
  completeSchema,
  toggleTaskSchema,
} = require('./visit-instances.validation');

const router = Router();

router.use(requireAuth, requireRole('SUPERVISOR'));

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  controller.getOne,
);

router.post(
  '/:id/start',
  validate(idParamSchema, 'params'),
  validate(startSchema),
  controller.start,
);

router.post(
  '/:id/final-closed',
  validate(idParamSchema, 'params'),
  validate(finalClosedSchema),
  controller.finalClosed,
);

router.post(
  '/:id/not-implemented',
  validate(idParamSchema, 'params'),
  validate(notImplementedSchema),
  controller.notImplemented,
);

router.post(
  '/:id/complete',
  validate(idParamSchema, 'params'),
  validate(completeSchema),
  controller.complete,
);

router.patch(
  '/:id/tasks/:taskCheckId',
  validate(taskCheckParamSchema, 'params'),
  validate(toggleTaskSchema),
  controller.toggleTask,
);

router.post(
  '/:id/photos',
  validate(idParamSchema, 'params'),
  visitPhotoUpload,
  controller.uploadPhotos,
);

router.delete(
  '/:id/photos/:photoId',
  validate(
    require('joi').object({
      id: require('joi').string().required(),
      photoId: require('joi').string().required(),
    }),
    'params',
  ),
  controller.removePhoto,
);

module.exports = router;

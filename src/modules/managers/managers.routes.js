const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./managers.controller');
const {
  createManagerSchema,
  updateManagerSchema,
  changePasswordSchema,
  updateStatusSchema,
  listManagersQuerySchema,
  idParamSchema,
} = require('./managers.validation');

const router = Router();

/**
 * Every endpoint in this module requires an authenticated ADMIN.
 * router.use applies the middleware before any route below.
 */
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listManagersQuerySchema, 'query'), controller.list);
router.post('/', validate(createManagerSchema), controller.create);

router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateManagerSchema),
  controller.update,
);

router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

router.patch(
  '/:id/password',
  validate(idParamSchema, 'params'),
  validate(changePasswordSchema),
  controller.changePassword,
);

router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

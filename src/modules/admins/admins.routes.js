const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admins.controller');
const {
  createSchema,
  updateSchema,
  changePasswordSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
} = require('./admins.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

/**
 * "Me" endpoints first — `/me/...` mustn't be confused with `/:id`.
 * These are the "update my own profile" endpoints from FRD §4.1.
 */
router.get('/me', controller.me);
router.patch('/me', validate(updateOwnProfileSchema), controller.updateMe);
router.patch(
  '/me/password',
  validate(changeOwnPasswordSchema),
  controller.changeMyPassword,
);

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.post('/', validate(createSchema), controller.create);

router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSchema),
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

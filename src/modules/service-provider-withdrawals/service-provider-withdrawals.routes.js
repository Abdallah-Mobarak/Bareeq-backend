const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./service-provider-withdrawals.controller');
const {
  createSchema,
  cancelSchema,
  listQuerySchema,
  idParamSchema,
} = require('./service-provider-withdrawals.validation');

const router = Router();

router.use(requireAuth, requireRole('SERVICE_PROVIDER'));

router.post('/', validate(createSchema), controller.create);
router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post(
  '/:id/cancel',
  validate(idParamSchema, 'params'),
  validate(cancelSchema),
  controller.cancel,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-bookings.controller');
const {
  createSchema,
  listQuerySchema,
  cancelSchema,
  idParamSchema,
} = require('./customer-bookings.validation');

const router = Router();

router.use(requireAuth, requireRole('CUSTOMER'));

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

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-customers.controller');
const {
  idParamSchema,
  listQuerySchema,
  updateStatusSchema,
} = require('./admin-customers.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-withdrawals.controller');
const {
  idParamSchema,
  listQuerySchema,
  approveSchema,
  rejectSchema,
} = require('./admin-withdrawals.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post(
  '/:id/approve',
  validate(idParamSchema, 'params'),
  validate(approveSchema),
  controller.approve,
);
router.post(
  '/:id/reject',
  validate(idParamSchema, 'params'),
  validate(rejectSchema),
  controller.reject,
);

module.exports = router;

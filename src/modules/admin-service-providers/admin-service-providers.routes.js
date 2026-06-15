const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-service-providers.controller');
const {
  idParamSchema,
  listQuerySchema,
  updateStatusSchema,
  kycDecisionSchema,
} = require('./admin-service-providers.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);
router.patch(
  '/:id/kyc',
  validate(idParamSchema, 'params'),
  validate(kycDecisionSchema),
  controller.reviewKyc,
);

module.exports = router;

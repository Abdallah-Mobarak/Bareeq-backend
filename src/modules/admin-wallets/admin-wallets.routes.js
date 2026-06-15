const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-wallets.controller');
const {
  userIdParamSchema,
  topupSchema,
  adjustmentSchema,
  transactionsQuerySchema,
} = require('./admin-wallets.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.get('/:userId', validate(userIdParamSchema, 'params'), controller.getWallet);
router.get(
  '/:userId/transactions',
  validate(userIdParamSchema, 'params'),
  validate(transactionsQuerySchema, 'query'),
  controller.listTransactions,
);
router.post(
  '/:userId/topup',
  validate(userIdParamSchema, 'params'),
  validate(topupSchema),
  controller.topup,
);
router.post(
  '/:userId/adjustment',
  validate(userIdParamSchema, 'params'),
  validate(adjustmentSchema),
  controller.adjustment,
);

module.exports = router;

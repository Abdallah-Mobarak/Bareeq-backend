const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./service-provider-wallet.controller');
const {
  transactionsQuerySchema,
  commissionsQuerySchema,
} = require('./service-provider-wallet.validation');

const router = Router();

router.use(requireAuth, requireRole('SERVICE_PROVIDER'));

router.get('/', controller.getWallet);
router.get(
  '/transactions',
  validate(transactionsQuerySchema, 'query'),
  controller.listTransactions,
);
router.get('/commissions', validate(commissionsQuerySchema, 'query'), controller.listCommissions);

module.exports = router;

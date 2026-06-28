const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-wallet.controller');
const { transactionsQuerySchema, topupSchema } = require('./customer-wallet.validation');

const router = Router();

router.use(requireAuth, requireRole('CUSTOMER'));

router.get('/', controller.getWallet);
router.get(
  '/transactions',
  validate(transactionsQuerySchema, 'query'),
  controller.listTransactions,
);
router.post('/topup', validate(topupSchema), controller.createTopup);

module.exports = router;

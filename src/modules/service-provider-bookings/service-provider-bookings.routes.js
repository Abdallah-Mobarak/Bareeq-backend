const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./service-provider-bookings.controller');
const {
  idParamSchema,
  poolQuerySchema,
  listMineQuerySchema,
} = require('./service-provider-bookings.validation');

const router = Router();

router.use(requireAuth, requireRole('SERVICE_PROVIDER'));

// Dashboard counters (FRD §2.2.1) — literal path before /:id.
router.get('/stats', controller.stats);

// Pool of PENDING bookings any verified SP can claim
router.get('/pool', validate(poolQuerySchema, 'query'), controller.listPool);
router.post('/:id/accept', validate(idParamSchema, 'params'), controller.accept);
router.post('/:id/reject', validate(idParamSchema, 'params'), controller.reject);

// Bookings already assigned to this SP
router.get('/', validate(listMineQuerySchema, 'query'), controller.listMine);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/:id/start', validate(idParamSchema, 'params'), controller.start);
router.post('/:id/complete', validate(idParamSchema, 'params'), controller.complete);
// Cash confirmation after the visit is implemented (FRD §2.3.1.1).
router.post('/:id/amount-received', validate(idParamSchema, 'params'), controller.amountReceived);

module.exports = router;

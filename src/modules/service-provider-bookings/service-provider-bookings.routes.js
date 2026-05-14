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

// Pool of PENDING bookings any verified SP can claim
router.get('/pool', validate(poolQuerySchema, 'query'), controller.listPool);
router.post('/:id/accept', validate(idParamSchema, 'params'), controller.accept);

// Bookings already assigned to this SP
router.get('/', validate(listMineQuerySchema, 'query'), controller.listMine);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/:id/start', validate(idParamSchema, 'params'), controller.start);
router.post('/:id/complete', validate(idParamSchema, 'params'), controller.complete);

module.exports = router;

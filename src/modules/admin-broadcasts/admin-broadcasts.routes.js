const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');

const controller = require('./admin-broadcasts.controller');
const {
  sendBroadcastSchema,
  listBroadcastsQuerySchema,
  idParamSchema,
} = require('./admin-broadcasts.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.post('/', validate(sendBroadcastSchema), controller.send);
router.get('/', validate(listBroadcastsQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

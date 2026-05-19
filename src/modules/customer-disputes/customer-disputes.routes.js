const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-disputes.controller');
const {
  createDisputeSchema,
  listDisputesQuerySchema,
  idParamSchema,
} = require('./customer-disputes.validation');

const router = Router();

router.use(requireAuth, requireRole('CUSTOMER'));

router.post('/', validate(createDisputeSchema), controller.file);
router.get('/', validate(listDisputesQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

module.exports = router;

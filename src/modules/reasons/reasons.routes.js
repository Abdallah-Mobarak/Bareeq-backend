const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./reasons.controller');
const {
  createReasonSchema,
  updateReasonSchema,
  listReasonsQuerySchema,
  idParamSchema,
} = require('./reasons.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listReasonsQuerySchema, 'query'), controller.list);
router.post('/', validate(createReasonSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateReasonSchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

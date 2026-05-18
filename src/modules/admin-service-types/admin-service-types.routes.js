const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-service-types.controller');
const {
  createServiceTypeSchema,
  updateServiceTypeSchema,
  listServiceTypesQuerySchema,
  idParamSchema,
} = require('./admin-service-types.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listServiceTypesQuerySchema, 'query'), controller.list);
router.post('/', validate(createServiceTypeSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateServiceTypeSchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

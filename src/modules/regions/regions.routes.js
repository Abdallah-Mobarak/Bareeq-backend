const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./regions.controller');
const {
  createRegionSchema,
  updateRegionSchema,
  listRegionsQuerySchema,
  idParamSchema,
} = require('./regions.validation');

const router = Router();

// Admin-only catalog management
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listRegionsQuerySchema, 'query'), controller.list);
router.post('/', validate(createRegionSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRegionSchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

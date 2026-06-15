const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-services.controller');
const {
  createSchema,
  updateSchema,
  updateCommissionSchema,
  listQuerySchema,
  idParamSchema,
} = require('./admin-services.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.post('/', validate(createSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateSchema), controller.update);
router.patch(
  '/:id/commission',
  validate(idParamSchema, 'params'),
  validate(updateCommissionSchema),
  controller.updateCommission,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

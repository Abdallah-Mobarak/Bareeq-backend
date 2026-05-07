const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./supervisors.controller');
const {
  createSupervisorSchema,
  updateSupervisorSchema,
  changePasswordSchema,
  updateStatusSchema,
  listSupervisorsQuerySchema,
  idParamSchema,
} = require('./supervisors.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listSupervisorsQuerySchema, 'query'), controller.list);
router.get(
  '/export.xlsx',
  validate(listSupervisorsQuerySchema, 'query'),
  controller.exportXlsx,
);
router.post('/', validate(createSupervisorSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSupervisorSchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);
router.patch(
  '/:id/password',
  validate(idParamSchema, 'params'),
  validate(changePasswordSchema),
  controller.changePassword,
);
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

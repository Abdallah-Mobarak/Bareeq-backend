const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./companies.controller');
const {
  createCompanySchema,
  updateCompanySchema,
  updateLoginSchema,
  changePasswordSchema,
  updateStatusSchema,
  listCompaniesQuerySchema,
  idParamSchema,
} = require('./companies.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listCompaniesQuerySchema, 'query'), controller.list);
router.post('/', validate(createCompanySchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCompanySchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);
router.patch(
  '/:id/login',
  validate(idParamSchema, 'params'),
  validate(updateLoginSchema),
  controller.updateLogin,
);
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

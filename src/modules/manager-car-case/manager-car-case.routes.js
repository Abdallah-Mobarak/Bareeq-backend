const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./manager-car-case.controller');
const {
  idParamSchema,
  createCarCaseSchema,
  updateCarCaseSchema,
  listCarCasesQuerySchema,
} = require('./manager-car-case.validation');

const router = Router();

/**
 * FRD §3.8 (Manager) + §4.10 (Admin) — both roles manage car cases.
 * Admin's view includes the `manager` field (FRD §4.10.1 "Manager
 * Name" column) which our serialiser already returns.
 */
router.use(requireAuth, requireRole('MANAGER', 'ADMIN'));

router.get('/', validate(listCarCasesQuerySchema, 'query'), controller.listCarCases);
router.post('/', validate(createCarCaseSchema), controller.createCarCase);

router.get(
  '/export.xlsx',
  validate(listCarCasesQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  validate(listCarCasesQuerySchema, 'query'),
  controller.exportPdf,
);

router.get('/:id', validate(idParamSchema, 'params'), controller.getCarCase);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCarCaseSchema),
  controller.updateCarCase,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.deleteCarCase);

module.exports = router;

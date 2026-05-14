const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
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

router.get(
  '/',
  requirePermission('VIEW_CAR_CASES'),
  validate(listCarCasesQuerySchema, 'query'),
  controller.listCarCases,
);
router.post(
  '/',
  requirePermission('MANAGE_CAR_CASES'),
  validate(createCarCaseSchema),
  controller.createCarCase,
);

router.get(
  '/export.xlsx',
  requirePermission('EXPORT_CAR_CASES'),
  validate(listCarCasesQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  requirePermission('EXPORT_CAR_CASES'),
  validate(listCarCasesQuerySchema, 'query'),
  controller.exportPdf,
);

router.get(
  '/:id',
  requirePermission('VIEW_CAR_CASE_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getCarCase,
);
router.patch(
  '/:id',
  requirePermission('MANAGE_CAR_CASES'),
  validate(idParamSchema, 'params'),
  validate(updateCarCaseSchema),
  controller.updateCarCase,
);
router.delete(
  '/:id',
  requirePermission('MANAGE_CAR_CASES'),
  validate(idParamSchema, 'params'),
  controller.deleteCarCase,
);

module.exports = router;

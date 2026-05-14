const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./manager-representatives.controller');
const {
  idParamSchema,
  createRepresentativeSchema,
  updateRepresentativeSchema,
  listRepresentativesQuerySchema,
} = require('./manager-representatives.validation');

const router = Router();

/**
 * FRD §3.10 (Manager) + §4.11 (Admin) — both roles manage
 * representatives. Admin's view shows the "Manager Name" column
 * (FRD §4.11.1) — the serialiser already includes it.
 */
router.use(requireAuth, requireRole('MANAGER', 'ADMIN'));

router.get(
  '/',
  requirePermission('VIEW_REPRESENTATIVES'),
  validate(listRepresentativesQuerySchema, 'query'),
  controller.listRepresentatives,
);
router.post(
  '/',
  requirePermission('MANAGE_REPRESENTATIVES'),
  validate(createRepresentativeSchema),
  controller.createRepresentative,
);

router.get(
  '/export.xlsx',
  requirePermission('EXPORT_REPRESENTATIVES'),
  validate(listRepresentativesQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  requirePermission('EXPORT_REPRESENTATIVES'),
  validate(listRepresentativesQuerySchema, 'query'),
  controller.exportPdf,
);

router.get(
  '/:id',
  requirePermission('VIEW_REPRESENTATIVE_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getRepresentative,
);
router.patch(
  '/:id',
  requirePermission('MANAGE_REPRESENTATIVES'),
  validate(idParamSchema, 'params'),
  validate(updateRepresentativeSchema),
  controller.updateRepresentative,
);
router.delete(
  '/:id',
  requirePermission('MANAGE_REPRESENTATIVES'),
  validate(idParamSchema, 'params'),
  controller.deleteRepresentative,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
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
  validate(listRepresentativesQuerySchema, 'query'),
  controller.listRepresentatives,
);
router.post('/', validate(createRepresentativeSchema), controller.createRepresentative);

router.get(
  '/export.xlsx',
  validate(listRepresentativesQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  validate(listRepresentativesQuerySchema, 'query'),
  controller.exportPdf,
);

router.get('/:id', validate(idParamSchema, 'params'), controller.getRepresentative);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRepresentativeSchema),
  controller.updateRepresentative,
);
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  controller.deleteRepresentative,
);

module.exports = router;

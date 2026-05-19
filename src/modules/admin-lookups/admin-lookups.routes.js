const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-lookups.controller');
const {
  createLookupSchema,
  updateLookupSchema,
  listLookupsQuerySchema,
  idParamSchema,
} = require('./admin-lookups.validation');

const router = Router();

/**
 * Auth + role split:
 *   - Reads (GET) → ADMIN or MANAGER. Managers need these to populate
 *     dropdowns in the monthly-sales and car-case forms.
 *   - Writes      → ADMIN only. Managing the lookup catalog is an
 *     admin responsibility per FRD §4.9.2 / §4.10.2.
 *
 * Same shape as the region-schedulings split.
 */
router.use(requireAuth);

router.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  validate(listLookupsQuerySchema, 'query'),
  controller.list,
);
router.get(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);

router.post('/', requireRole('ADMIN'), validate(createLookupSchema), controller.create);
router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateLookupSchema),
  controller.update,
);
router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  controller.remove,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const { excelUpload } = require('../../middlewares/uploadFile');
const controller = require('./region-schedulings.controller');
const {
  createSchema,
  updateSchema,
  listQuerySchema,
  idParamSchema,
} = require('./region-schedulings.validation');

const router = Router();

/**
 * All routes require an authenticated user. Role gating happens
 * per-route below:
 *   - Reads (GET / and GET /:id)         → ADMIN or MANAGER
 *     Managers need this to populate branch dropdowns / filter
 *     selectors across the manager portal (additional tasks form,
 *     implemented-branches filters, monthly-reports filters).
 *   - Writes + import/export             → ADMIN only
 *     Managers don't create or mutate the branch catalog; that's
 *     the admin's responsibility per FRD §4.2.2.2.1.
 */
router.use(requireAuth);

// Import / export must come BEFORE /:id otherwise Express matches them
// as `id="import"` / `id="export.xlsx"` and validation rejects them.
router.post('/import', requireRole('ADMIN'), excelUpload, controller.importExcel);
router.get(
  '/export.xlsx',
  requireRole('ADMIN'),
  validate(listQuerySchema, 'query'),
  controller.exportExcel,
);
router.get(
  '/export.pdf',
  requireRole('ADMIN'),
  validate(listQuerySchema, 'query'),
  controller.exportPdf,
);

router.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  validate(listQuerySchema, 'query'),
  controller.list,
);
router.post('/', requireRole('ADMIN'), validate(createSchema), controller.create);

router.get(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  controller.update,
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate(idParamSchema, 'params'),
  controller.remove,
);

module.exports = router;

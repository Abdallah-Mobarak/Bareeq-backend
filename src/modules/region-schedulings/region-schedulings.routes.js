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

router.use(requireAuth, requireRole('ADMIN'));

// Import / export must come BEFORE /:id otherwise Express matches them
// as `id="import"` / `id="export.xlsx"` and validation rejects them.
router.post('/import', excelUpload, controller.importExcel);
router.get('/export.xlsx', validate(listQuerySchema, 'query'), controller.exportExcel);
router.get('/export.pdf', validate(listQuerySchema, 'query'), controller.exportPdf);

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.post('/', validate(createSchema), controller.create);

router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  controller.update,
);

router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

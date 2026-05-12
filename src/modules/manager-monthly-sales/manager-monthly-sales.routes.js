const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./manager-monthly-sales.controller');
const {
  idParamSchema,
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} = require('./manager-monthly-sales.validation');

const router = Router();

router.use(requireAuth, requireRole('MANAGER'));

/**
 * Monthly Sales / Clients — FRD §3.7.
 * Export routes BEFORE /:id (Express order trick).
 */
router.get('/', validate(listClientsQuerySchema, 'query'), controller.listClients);
router.post('/', validate(createClientSchema), controller.createClient);

router.get(
  '/export.xlsx',
  validate(listClientsQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  validate(listClientsQuerySchema, 'query'),
  controller.exportPdf,
);

router.get('/:id', validate(idParamSchema, 'params'), controller.getClient);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateClientSchema),
  controller.updateClient,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.deleteClient);

module.exports = router;

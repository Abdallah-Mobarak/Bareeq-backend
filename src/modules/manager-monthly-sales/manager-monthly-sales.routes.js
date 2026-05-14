const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./manager-monthly-sales.controller');
const {
  idParamSchema,
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} = require('./manager-monthly-sales.validation');

const router = Router();

/**
 * FRD §3.7 (Manager) + §4.9 (Admin) — both roles manage clients.
 * Admin's serialiser already includes the `manager` field so the
 * "Manager Name" column from §4.9.1 surfaces automatically.
 */
router.use(requireAuth, requireRole('MANAGER', 'ADMIN'));

/**
 * Monthly Sales / Clients — FRD §3.7.
 * Export routes BEFORE /:id (Express order trick).
 */
router.get(
  '/',
  requirePermission('VIEW_SALES'),
  validate(listClientsQuerySchema, 'query'),
  controller.listClients,
);
router.post(
  '/',
  requirePermission('MANAGE_SALES'),
  validate(createClientSchema),
  controller.createClient,
);

router.get(
  '/export.xlsx',
  requirePermission('EXPORT_SALES'),
  validate(listClientsQuerySchema, 'query'),
  controller.exportXlsx,
);
router.get(
  '/export.pdf',
  requirePermission('EXPORT_SALES'),
  validate(listClientsQuerySchema, 'query'),
  controller.exportPdf,
);

router.get(
  '/:id',
  requirePermission('VIEW_SALE_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getClient,
);
router.patch(
  '/:id',
  requirePermission('MANAGE_SALES'),
  validate(idParamSchema, 'params'),
  validate(updateClientSchema),
  controller.updateClient,
);
router.delete(
  '/:id',
  requirePermission('MANAGE_SALES'),
  validate(idParamSchema, 'params'),
  controller.deleteClient,
);

module.exports = router;

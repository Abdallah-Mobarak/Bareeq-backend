const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./managers.controller');
const {
  createManagerSchema,
  updateManagerSchema,
  changePasswordSchema,
  updateStatusSchema,
  listManagersQuerySchema,
  idParamSchema,
} = require('./managers.validation');

const router = Router();

/**
 * Managers Management — FRD §4.4.
 *
 * Originally ADMIN-only. Opened to MANAGER too so an admin can delegate
 * a "team lead" manager to onboard / disable other managers via the
 * permission-role system. Per-route permission keys decide who actually
 * gets in; the role guard here just unblocks the gateway.
 */
router.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

router.get(
  '/',
  requirePermission('VIEW_MANAGERS'),
  validate(listManagersQuerySchema, 'query'),
  controller.list,
);
router.get(
  '/export.xlsx',
  requirePermission('EXPORT_MANAGERS'),
  validate(listManagersQuerySchema, 'query'),
  controller.exportXlsx,
);
router.post(
  '/',
  requirePermission('MANAGE_MANAGERS'),
  validate(createManagerSchema),
  controller.create,
);

router.get(
  '/:id',
  requirePermission('VIEW_MANAGER_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);

router.patch(
  '/:id',
  requirePermission('MANAGE_MANAGERS'),
  validate(idParamSchema, 'params'),
  validate(updateManagerSchema),
  controller.update,
);

router.delete(
  '/:id',
  requirePermission('MANAGE_MANAGERS'),
  validate(idParamSchema, 'params'),
  controller.remove,
);

router.patch(
  '/:id/password',
  requirePermission('MANAGE_MANAGERS'),
  validate(idParamSchema, 'params'),
  validate(changePasswordSchema),
  controller.changePassword,
);

router.patch(
  '/:id/status',
  requirePermission('MANAGE_MANAGERS'),
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

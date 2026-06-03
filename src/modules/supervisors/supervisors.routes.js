const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./supervisors.controller');
const {
  createSupervisorSchema,
  updateSupervisorSchema,
  changePasswordSchema,
  updateStatusSchema,
  listSupervisorsQuerySchema,
  idParamSchema,
} = require('./supervisors.validation');

const router = Router();

/**
 * Supervisors Management — FRD §4.5.
 *
 * Open to ADMIN and MANAGER; per-route permission keys decide who can
 * actually read/write. Mirrors the managers-routes layout (FRD §4.4).
 */
router.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

router.get(
  '/',
  requirePermission('VIEW_SUPERVISORS'),
  validate(listSupervisorsQuerySchema, 'query'),
  controller.list,
);
router.get(
  '/export.xlsx',
  requirePermission('EXPORT_SUPERVISORS'),
  validate(listSupervisorsQuerySchema, 'query'),
  controller.exportXlsx,
);
router.post(
  '/',
  requirePermission('MANAGE_SUPERVISORS'),
  validate(createSupervisorSchema),
  controller.create,
);
router.get(
  '/:id',
  requirePermission('VIEW_SUPERVISOR_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);
router.patch(
  '/:id',
  requirePermission('MANAGE_SUPERVISORS'),
  validate(idParamSchema, 'params'),
  validate(updateSupervisorSchema),
  controller.update,
);
router.delete(
  '/:id',
  requirePermission('MANAGE_SUPERVISORS'),
  validate(idParamSchema, 'params'),
  controller.remove,
);
router.patch(
  '/:id/password',
  requirePermission('MANAGE_SUPERVISORS'),
  validate(idParamSchema, 'params'),
  validate(changePasswordSchema),
  controller.changePassword,
);
router.patch(
  '/:id/status',
  requirePermission('MANAGE_SUPERVISORS'),
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

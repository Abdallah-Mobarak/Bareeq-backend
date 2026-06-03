const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./admins.controller');
const {
  createSchema,
  updateSchema,
  changePasswordSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
} = require('./admins.validation');

const router = Router();

/**
 * Admins Management — FRD §4.3.
 *
 * Open to ADMIN and MANAGER at the gateway; per-route permission keys
 * decide who actually gets in. The `/me/*` routes are an exception —
 * they target the caller's OWN admin profile (FRD §4.1), so they stay
 * locked to the ADMIN role with an extra route-level guard. A manager
 * has no admin profile, so /me wouldn't make sense for them anyway.
 *
 * Granting MANAGE_ADMINS to a Manager is a real escalation — that
 * manager can create / disable / reset-password OTHER admins. Use it
 * deliberately in the role-builder UI.
 */
router.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

/**
 * "Me" endpoints first — `/me/...` mustn't be confused with `/:id`.
 * Stricter role guard here overrides the router-level allowance.
 */
router.get('/me', requireRole('ADMIN'), controller.me);
router.patch(
  '/me',
  requireRole('ADMIN'),
  validate(updateOwnProfileSchema),
  controller.updateMe,
);
router.patch(
  '/me/password',
  requireRole('ADMIN'),
  validate(changeOwnPasswordSchema),
  controller.changeMyPassword,
);

router.get(
  '/',
  requirePermission('VIEW_ADMINS'),
  validate(listQuerySchema, 'query'),
  controller.list,
);
router.get(
  '/export.xlsx',
  requirePermission('EXPORT_ADMINS'),
  validate(listQuerySchema, 'query'),
  controller.exportXlsx,
);
router.post(
  '/',
  requirePermission('MANAGE_ADMINS'),
  validate(createSchema),
  controller.create,
);

router.get(
  '/:id',
  requirePermission('VIEW_ADMIN_DETAILS'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);

router.patch(
  '/:id',
  requirePermission('MANAGE_ADMINS'),
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  controller.update,
);

router.delete(
  '/:id',
  requirePermission('MANAGE_ADMINS'),
  validate(idParamSchema, 'params'),
  controller.remove,
);

router.patch(
  '/:id/password',
  requirePermission('MANAGE_ADMINS'),
  validate(idParamSchema, 'params'),
  validate(changePasswordSchema),
  controller.changePassword,
);

router.patch(
  '/:id/status',
  requirePermission('MANAGE_ADMINS'),
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

module.exports = router;

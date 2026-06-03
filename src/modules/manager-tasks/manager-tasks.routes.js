const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./manager-tasks.controller');
const {
  createSchema,
  updateSchema,
  listQuerySchema,
  myListQuerySchema,
  setStatusSchema,
  idParamSchema,
} = require('./manager-tasks.validation');

const router = Router();

router.use(requireAuth);

/**
 * Manager self-service routes — must be mounted BEFORE the `/:id`
 * routes so `/my/...` doesn't get matched as an id.
 */
router.get(
  '/my',
  requireRole('MANAGER'),
  validate(myListQuerySchema, 'query'),
  controller.listMine,
);

router.patch(
  '/my/:id/status',
  requireRole('MANAGER'),
  validate(idParamSchema, 'params'),
  validate(setStatusSchema),
  controller.setMineStatus,
);

/**
 * All-tasks views + cross-task status flip.
 *
 * Opened to MANAGER (in addition to ADMIN) per the §4.2.1.3 read-side
 * extension: a manager with MANAGE_TASKS can see every manager's tasks
 * and mark any of them done. CREATE / full UPDATE / DELETE stay
 * ADMIN-only — managers cannot author or rewrite task definitions.
 *
 * Define `/:id/status` BEFORE `/:id` so the more-specific path wins.
 */
router.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  requirePermission('MANAGE_TASKS'),
  validate(listQuerySchema, 'query'),
  controller.list,
);

router.patch(
  '/:id/status',
  requireRole('ADMIN', 'MANAGER'),
  requirePermission('MANAGE_TASKS'),
  validate(idParamSchema, 'params'),
  validate(setStatusSchema),
  controller.setStatus,
);

router.get(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  requirePermission('MANAGE_TASKS'),
  validate(idParamSchema, 'params'),
  controller.getOne,
);

// Admin-only writes
router.post(
  '/',
  requireRole('ADMIN'),
  validate(createSchema),
  controller.create,
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

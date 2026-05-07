const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
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
 * Manager self-service routes — must be mounted BEFORE the admin
 * `/:id` route so `/my/...` doesn't get matched as an id.
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

// Admin routes
router.use(requireRole('ADMIN'));

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

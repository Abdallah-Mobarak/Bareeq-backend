const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./permission-roles.controller');
const {
  createRoleSchema,
  updateRoleSchema,
  listRolesQuerySchema,
  idParamSchema,
} = require('./permission-roles.validation');

const router = Router();

/**
 * Roles management is admin-only. Self-service role creation by managers
 * would be a privilege-escalation hole.
 */
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listRolesQuerySchema, 'query'), controller.list);
router.post('/', validate(createRoleSchema), controller.create);

router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRoleSchema),
  controller.update,
);

router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

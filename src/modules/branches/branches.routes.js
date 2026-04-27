const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./branches.controller');
const {
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
  idParamSchema,
} = require('./branches.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listBranchesQuerySchema, 'query'), controller.list);
router.post('/', validate(createBranchSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateBranchSchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

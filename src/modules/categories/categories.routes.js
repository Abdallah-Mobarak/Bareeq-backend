const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./categories.controller');
const {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  idParamSchema,
} = require('./categories.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listCategoriesQuerySchema, 'query'), controller.list);
router.post('/', validate(createCategorySchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCategorySchema),
  controller.update,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

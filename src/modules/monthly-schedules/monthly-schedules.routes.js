const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./monthly-schedules.controller');
const {
  createScheduleSchema,
  listSchedulesQuerySchema,
  idParamSchema,
} = require('./monthly-schedules.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listSchedulesQuerySchema, 'query'), controller.list);
router.post('/', validate(createScheduleSchema), controller.create);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

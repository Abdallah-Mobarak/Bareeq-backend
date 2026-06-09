const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./monthly-schedules.controller');
const {
  createScheduleSchema,
  listSchedulesQuerySchema,
  idParamSchema,
  announceReportSchema,
} = require('./monthly-schedules.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listSchedulesQuerySchema, 'query'), controller.list);
router.post('/', validate(createScheduleSchema), controller.create);
// Announce that a month's report is ready (FRD §2.5 → company notification).
router.post('/announce-report', validate(announceReportSchema), controller.announceReport);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

module.exports = router;

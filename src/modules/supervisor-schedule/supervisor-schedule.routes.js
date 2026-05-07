const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./supervisor-schedule.controller');
const {
  listMyBranchesQuerySchema,
  idParamSchema,
} = require('./supervisor-schedule.validation');

const router = Router();

router.use(requireAuth, requireRole('SUPERVISOR'));

router.get('/my-schedule', controller.summary);

router.get(
  '/my-schedule/branches',
  validate(listMyBranchesQuerySchema, 'query'),
  controller.listBranches,
);

router.get(
  '/branches/:id',
  validate(idParamSchema, 'params'),
  controller.branchDetail,
);

module.exports = router;

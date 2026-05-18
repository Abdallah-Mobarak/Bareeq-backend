const { Router } = require('express');

const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./manager-service-types.controller');

const router = Router();

router.use(requireAuth, requireRole('MANAGER'));

router.get('/', controller.list);

module.exports = router;

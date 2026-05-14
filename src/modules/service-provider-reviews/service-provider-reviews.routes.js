const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./service-provider-reviews.controller');
const { listQuerySchema } = require('./service-provider-reviews.validation');

const router = Router();

router.use(requireAuth, requireRole('SERVICE_PROVIDER'));

router.get('/', validate(listQuerySchema, 'query'), controller.list);

module.exports = router;

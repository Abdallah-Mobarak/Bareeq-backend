const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-financial.controller');
const { summaryQuerySchema } = require('./admin-financial.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

router.get('/summary', validate(summaryQuerySchema, 'query'), controller.getSummary);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-users.controller');
const { lookupQuerySchema } = require('./admin-users.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

/**
 * Type-ahead lookup for the broadcast "Specific Users" picker.
 * GET /admin/users/lookup?q=&role=&limit=
 */
router.get('/lookup', validate(lookupQuerySchema, 'query'), controller.lookup);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./permissions.controller');
const { listPermissionsQuerySchema } = require('./permissions.validation');

const router = Router();

/**
 * Read-only catalog. ADMIN-only — there's nothing here that a manager
 * or supervisor needs to see.
 */
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listPermissionsQuerySchema, 'query'), controller.list);

module.exports = router;

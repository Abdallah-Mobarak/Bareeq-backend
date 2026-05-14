const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-profile.controller');
const { updateSchema, changePasswordSchema } = require('./customer-profile.validation');

const router = Router();

/**
 * Customer self-service profile (FRD §1.1). Mounted at /customer/profile.
 * Every endpoint requires the caller to be authenticated AS a CUSTOMER.
 */
router.use(requireAuth, requireRole('CUSTOMER'));

router.get('/', controller.getProfile);
router.patch('/', validate(updateSchema), controller.updateProfile);
router.post('/change-password', validate(changePasswordSchema), controller.changePassword);

module.exports = router;

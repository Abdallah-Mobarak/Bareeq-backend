const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./service-provider-profile.controller');
const {
  updateSchema,
  changePasswordSchema,
  deleteAccountSchema,
} = require('./service-provider-profile.validation');

const router = Router();

/**
 * Service Provider self-service profile (FRD §2.1). Mounted at
 * /service-provider/profile. Requires SERVICE_PROVIDER role.
 */
router.use(requireAuth, requireRole('SERVICE_PROVIDER'));

router.get('/', controller.getProfile);
router.patch('/', validate(updateSchema), controller.updateProfile);
router.post('/change-password', validate(changePasswordSchema), controller.changePassword);
router.delete('/', validate(deleteAccountSchema), controller.deleteAccount);

module.exports = router;

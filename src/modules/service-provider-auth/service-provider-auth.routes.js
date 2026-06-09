const { Router } = require('express');

const validate = require('../../middlewares/validate');
const controller = require('./service-provider-auth.controller');
const {
  signupRequestSchema,
  signupVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} = require('./service-provider-auth.validation');

const router = Router();

/**
 * Service Provider auth (Marketplace §2.1). All endpoints are public.
 * Mounted at /auth/service-provider in src/routes/index.js.
 */

// Public "Service Type" dropdown for the signup screen (FRD §2.1).
router.get('/service-types', controller.listServiceTypes);

router.post('/signup', validate(signupRequestSchema), controller.requestSignup);
router.post('/signup/verify', validate(signupVerifySchema), controller.verifySignup);

router.post(
  '/password-reset/request',
  validate(passwordResetRequestSchema),
  controller.requestPasswordReset,
);
router.post(
  '/password-reset/confirm',
  validate(passwordResetConfirmSchema),
  controller.confirmPasswordReset,
);

module.exports = router;

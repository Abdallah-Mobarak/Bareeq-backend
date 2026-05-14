const { Router } = require('express');

const validate = require('../../middlewares/validate');
const controller = require('./customer-auth.controller');
const {
  signupRequestSchema,
  signupVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} = require('./customer-auth.validation');

const router = Router();

/**
 * Customer auth (Marketplace §1.1). All endpoints are public — they
 * exist to *create* a session, not to act on one.
 *
 * Mounted at /auth/customer in src/routes/index.js.
 */

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

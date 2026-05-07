const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./visit-documentation.controller');
const {
  idParamSchema,
  tokenParamSchema,
  sendOtpSchema,
  verifyOtpSchema,
  submitDocumentationSchema,
} = require('./visit-documentation.validation');

/**
 * Two routers from one module:
 *   - `supervisorRouter`: mounted under /visit-instances/:id/document/*
 *     and gated by SUPERVISOR auth.
 *   - `publicRouter`: mounted under /public/document/:token/* with
 *     NO auth — just the slug acts as the capability token.
 */

const supervisorRouter = Router();
supervisorRouter.use(requireAuth, requireRole('SUPERVISOR'));

supervisorRouter.post(
  '/:id/document/send-otp',
  validate(idParamSchema, 'params'),
  validate(sendOtpSchema),
  controller.sendOtp,
);

supervisorRouter.post(
  '/:id/document/verify-otp',
  validate(idParamSchema, 'params'),
  validate(verifyOtpSchema),
  controller.verifyOtp,
);

const publicRouter = Router();

publicRouter.get(
  '/:token',
  validate(tokenParamSchema, 'params'),
  controller.publicView,
);

publicRouter.post(
  '/:token/submit',
  validate(tokenParamSchema, 'params'),
  validate(submitDocumentationSchema),
  controller.publicSubmit,
);

publicRouter.get(
  '/:token/pdf',
  validate(tokenParamSchema, 'params'),
  controller.publicPdf,
);

module.exports = { supervisorRouter, publicRouter };

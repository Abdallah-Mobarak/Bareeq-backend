const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./additional-task-documentation.controller');
const {
  idParamSchema,
  tokenParamSchema,
  sendOtpSchema,
  verifyOtpSchema,
  submitDocumentationSchema,
} = require('./additional-task-documentation.validation');

/**
 * Two routers from one module (mirrors visit-documentation):
 *   - `supervisorRouter`: mounted under /supervisor/additional-tasks and
 *     gated by SUPERVISOR auth (/:id/document/send-otp + /verify-otp).
 *   - `publicRouter`: mounted under /public/additional-task-document/:token
 *     with NO auth — the slug is the capability token.
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

publicRouter.get('/:token', validate(tokenParamSchema, 'params'), controller.publicView);
publicRouter.post(
  '/:token/submit',
  validate(tokenParamSchema, 'params'),
  validate(submitDocumentationSchema),
  controller.publicSubmit,
);
publicRouter.get('/:token/pdf', validate(tokenParamSchema, 'params'), controller.publicPdf);

module.exports = { supervisorRouter, publicRouter };

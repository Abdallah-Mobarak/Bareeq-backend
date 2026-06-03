const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const requirePermission = require('../../middlewares/requirePermission');
const controller = require('./admin-contact-messages.controller');
const {
  idParamSchema,
  listMessagesQuerySchema,
  replyBodySchema,
} = require('./admin-contact-messages.validation');

const router = Router();

/**
 * User Contact Messages — FRD §4.10.
 *
 * Open to ADMIN and MANAGER; per-route permission keys decide who can
 * read vs. write. Read endpoints gate on VIEW_MESSAGES; reply + delete
 * both gate on REPLY_MESSAGES (the existing write key — no separate
 * delete key in the catalog, and the FRD treats reply-and-clear as one
 * "handle the message" action).
 */
router.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

router.get(
  '/',
  requirePermission('VIEW_MESSAGES'),
  validate(listMessagesQuerySchema, 'query'),
  controller.listMessages,
);
router.get(
  '/:id',
  requirePermission('VIEW_MESSAGES'),
  validate(idParamSchema, 'params'),
  controller.getMessage,
);
router.post(
  '/:id/reply',
  requirePermission('REPLY_MESSAGES'),
  validate(idParamSchema, 'params'),
  validate(replyBodySchema),
  controller.replyToMessage,
);
router.delete(
  '/:id',
  requirePermission('REPLY_MESSAGES'),
  validate(idParamSchema, 'params'),
  controller.deleteMessage,
);

module.exports = router;

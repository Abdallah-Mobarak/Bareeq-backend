const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-contact-messages.controller');
const {
  idParamSchema,
  listMessagesQuerySchema,
  replyBodySchema,
} = require('./admin-contact-messages.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', validate(listMessagesQuerySchema, 'query'), controller.listMessages);
router.get('/:id', validate(idParamSchema, 'params'), controller.getMessage);
router.post(
  '/:id/reply',
  validate(idParamSchema, 'params'),
  validate(replyBodySchema),
  controller.replyToMessage,
);
router.delete('/:id', validate(idParamSchema, 'params'), controller.deleteMessage);

module.exports = router;

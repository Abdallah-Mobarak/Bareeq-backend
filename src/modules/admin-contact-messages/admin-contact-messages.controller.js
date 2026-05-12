const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-contact-messages.service');

/** GET /admin/contact-messages — FRD §4.12.1 */
const listMessages = asyncHandler(async (req, res) => {
  const data = await service.listMessages(req.validatedQuery || {});
  res.json({ success: true, data });
});

/** GET /admin/contact-messages/:id */
const getMessage = asyncHandler(async (req, res) => {
  const data = await service.getMessageById(req.params.id);
  res.json({ success: true, data });
});

/** POST /admin/contact-messages/:id/reply — FRD §4.12.2 */
const replyToMessage = asyncHandler(async (req, res) => {
  const data = await service.replyToMessage(req.user.id, req.params.id, req.body);
  res.json({ success: true, data });
});

/** DELETE /admin/contact-messages/:id */
const deleteMessage = asyncHandler(async (req, res) => {
  await service.deleteMessage(req.params.id);
  res.json({ success: true, data: { message: 'Message deleted' } });
});

module.exports = { listMessages, getMessage, replyToMessage, deleteMessage };

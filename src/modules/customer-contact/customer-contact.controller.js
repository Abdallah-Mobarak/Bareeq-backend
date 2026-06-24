const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-contact.service');

/**
 * POST /customer/contact
 * Submit a Contact-Us message from a CUSTOMER to admins. Returns 201 + the
 * persisted message — same shape as POST /company/contact.
 */
const submitContact = asyncHandler(async (req, res) => {
  const data = await service.submitContactMessage(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

/**
 * GET /customer/contact/my-messages
 * Paginated history of the caller's own messages, newest first, with any
 * admin replies inlined.
 */
const listMyMessages = asyncHandler(async (req, res) => {
  const data = await service.listMyContactMessages(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

module.exports = {
  submitContact,
  listMyMessages,
};

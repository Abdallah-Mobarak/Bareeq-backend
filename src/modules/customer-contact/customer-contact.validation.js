const Joi = require('joi');

// Mirrors the company Contact-Us schema exactly so both surfaces validate
// identically. email/phone/message are re-entered by the user (may differ
// from their login identity).
const submitContactSchema = Joi.object({
  email: Joi.string().email({ tlds: false }).max(150).required(),
  phone: Joi.string().trim().min(6).max(25).required(),
  message: Joi.string().trim().min(5).max(2000).required(),
});

const listContactMessagesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  submitContactSchema,
  listContactMessagesQuerySchema,
};

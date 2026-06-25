const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const tokenParamSchema = Joi.object({
  token: Joi.string().min(20).max(120).required(),
});

/** Saudi phone shape — `+9665xxxxxxxx` / `05xxxxxxxx`. */
const phoneSchema = Joi.string()
  .trim()
  .pattern(/^(\+966|00966|0)?5\d{8}$/)
  .messages({ 'string.pattern.base': 'phone must be a valid Saudi mobile number' });

/** POST /supervisor/additional-tasks/:id/document/send-otp */
const sendOtpSchema = Joi.object({
  branchManagerPhone: phoneSchema.required(),
});

/** POST /supervisor/additional-tasks/:id/document/verify-otp */
const verifyOtpSchema = Joi.object({
  otp: Joi.string()
    .pattern(/^\d{4}$/)
    .required()
    .messages({ 'string.pattern.base': 'otp must be exactly 4 digits' }),
});

/** POST /public/additional-task-document/:token/submit (branch manager, no auth) */
const submitDocumentationSchema = Joi.object({
  jobNumber: Joi.string().trim().max(100).optional().allow(null, ''),
  rating: Joi.number().integer().min(1).max(5).required(),
  comments: Joi.string().trim().max(2000).optional().allow(null, ''),
});

module.exports = {
  idParamSchema,
  tokenParamSchema,
  sendOtpSchema,
  verifyOtpSchema,
  submitDocumentationSchema,
};

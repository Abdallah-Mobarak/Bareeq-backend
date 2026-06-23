const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const tokenParamSchema = Joi.object({
  token: Joi.string().min(20).max(120).required(),
});

/**
 * Saudi phone shape — `+9665xxxxxxxx` or local `05xxxxxxxx`. We allow
 * a few variants; the OTP service will normalise to E.164 anyway.
 */
const phoneSchema = Joi.string()
  .trim()
  .pattern(/^(\+966|00966|0)?5\d{8}$/)
  .messages({ 'string.pattern.base': 'phone must be a valid Saudi mobile number' });

/**
 * POST /visit-instances/:id/document/send-otp (supervisor).
 * The supervisor enters the branch manager's phone; the system creates
 * an OTP + a public documentation link.
 */
const sendOtpSchema = Joi.object({
  branchManagerPhone: phoneSchema.required(),
});

/**
 * POST /visit-instances/:id/document/verify-otp (supervisor).
 * The supervisor types the 4-digit OTP that the branch manager
 * received. If valid → mark DOCUMENTED.
 */
const verifyOtpSchema = Joi.object({
  otp: Joi.string()
    .pattern(/^\d{4}$/)
    .required()
    .messages({ 'string.pattern.base': 'otp must be exactly 4 digits' }),
});

/**
 * POST /public/document/:token/submit (branch manager, no auth).
 * The branch manager fills in their part of the documentation. The
 * visit's documentationStatus only flips after the supervisor's OTP
 * verification — this endpoint just stores the answers.
 */
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

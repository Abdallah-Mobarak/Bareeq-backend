const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED').optional(),
  spId: Joi.string().optional(),
  sort: Joi.string().valid('newest', 'oldest', 'pendingFirst').default('pendingFirst'),
});

/**
 * On approve, the admin pastes the bank's transfer reference — proof
 * the money actually moved. Required so we never mark APPROVED on a
 * request that wasn't actually paid out.
 */
const approveSchema = Joi.object({
  bankTransferRef: Joi.string().trim().min(2).max(100).required().messages({
    'any.required': 'Bank transfer reference is required on approval',
  }),
  adminNote: Joi.string().trim().max(500).optional().allow(null, ''),
});

/**
 * On reject, the admin must capture a reason. The SP sees this string
 * in their notification, so make it human-readable.
 */
const rejectSchema = Joi.object({
  adminNote: Joi.string().trim().min(2).max(500).required().messages({
    'any.required': 'A reason is required on rejection',
  }),
});

module.exports = { idParamSchema, listQuerySchema, approveSchema, rejectSchema };

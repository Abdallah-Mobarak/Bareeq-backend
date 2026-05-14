const Joi = require('joi');

const userIdParamSchema = Joi.object({
  userId: Joi.string().required(),
});

const topupSchema = Joi.object({
  amount: Joi.number().positive().precision(2).max(1000000).required(),
  note: Joi.string().trim().max(500).optional().allow(null, ''),
  externalRef: Joi.string().trim().max(100).optional().allow(null, ''),
});

const adjustmentSchema = Joi.object({
  direction: Joi.string().valid('CREDIT', 'DEBIT').required(),
  amount: Joi.number().positive().precision(2).max(1000000).required(),
  note: Joi.string().trim().min(2).max(500).required().messages({
    'any.required': 'A reason is required for admin adjustments (audit trail)',
  }),
});

const transactionsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string()
    .valid(
      'TOPUP',
      'BOOKING_DEBIT',
      'REFUND',
      'BOOKING_CREDIT',
      'COMMISSION_DEBIT',
      'WITHDRAWAL',
      'ADJUSTMENT_CREDIT',
      'ADJUSTMENT_DEBIT',
    )
    .optional(),
});

module.exports = {
  userIdParamSchema,
  topupSchema,
  adjustmentSchema,
  transactionsQuerySchema,
};

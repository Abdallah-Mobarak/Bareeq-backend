const Joi = require('joi');

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

module.exports = { transactionsQuerySchema };

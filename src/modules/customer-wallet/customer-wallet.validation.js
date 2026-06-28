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

// Wallet top-up: amount in SAR, positive, min 1, max 100000, max 2 decimals.
const topupSchema = Joi.object({
  amount: Joi.number().positive().min(1).max(100000).precision(2).required().messages({
    'number.base': 'Amount must be a number',
    'number.positive': 'Amount must be greater than zero',
    'number.min': 'Minimum top-up is 1 SAR',
    'number.max': 'Maximum top-up is 100000 SAR',
  }),
});

module.exports = { transactionsQuerySchema, topupSchema };

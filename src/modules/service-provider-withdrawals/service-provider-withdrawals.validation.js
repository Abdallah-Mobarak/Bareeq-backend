const Joi = require('joi');

/**
 * SP withdrawal requests — FRD §3.5.2.
 *
 * Bank details captured per-request for MVP. When SP profile gains
 * a saved-bank-account entity, these become optional and fall back
 * to the saved one.
 */

const MIN_AMOUNT = 50;

const createSchema = Joi.object({
  amount: Joi.number()
    .min(MIN_AMOUNT)
    .max(1000000)
    .precision(2)
    .required()
    .messages({
      'number.min': `Minimum withdrawal amount is ${MIN_AMOUNT} SAR`,
    }),
  // Withdrawal channel (FRD §2.1). Defaults to BANK for backward compat.
  // Each method requires its own field set and forbids the other's.
  method: Joi.string().valid('BANK', 'EWALLET').default('BANK'),

  // BANK fields
  bankName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .when('method', { is: 'BANK', then: Joi.required(), otherwise: Joi.forbidden() }),
  bankAccountIban: Joi.string()
    .trim()
    .min(8)
    .max(50)
    .when('method', { is: 'BANK', then: Joi.required(), otherwise: Joi.forbidden() })
    .messages({ 'any.required': 'IBAN is required' }),
  accountHolderName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .when('method', { is: 'BANK', then: Joi.required(), otherwise: Joi.forbidden() }),

  // E-WALLET fields
  walletName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .when('method', { is: 'EWALLET', then: Joi.required(), otherwise: Joi.forbidden() }),
  walletId: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .when('method', { is: 'EWALLET', then: Joi.required(), otherwise: Joi.forbidden() }),
});

const cancelSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional().allow(null, ''),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED').optional(),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { createSchema, cancelSchema, listQuerySchema, idParamSchema };

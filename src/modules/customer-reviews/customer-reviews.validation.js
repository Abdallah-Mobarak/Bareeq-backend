const Joi = require('joi');

/**
 * Customer reviews — FRD §1.2.1 / §1.2.2 ("Service Rating").
 *
 * One review per booking, submitted by the customer after the booking
 * is COMPLETED. Reviews are frozen on submit (no PATCH/DELETE in MVP).
 */

const createSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'Rating must be between 1 and 5',
    'number.max': 'Rating must be between 1 and 5',
  }),
  comment: Joi.string().trim().max(1000).optional().allow(null, ''),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { createSchema, idParamSchema };

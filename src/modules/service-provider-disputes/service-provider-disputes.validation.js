const Joi = require('joi');

/**
 * Service Provider Disputes — FRD §3.6 marketplace.
 * Mirror of customer-disputes.validation — same shape, different actor.
 */
const createDisputeSchema = Joi.object({
  subject: Joi.string().trim().min(3).max(200).required(),
  message: Joi.string().trim().min(10).max(5000).required(),
  bookingId: Joi.string().trim().min(1).max(40).optional().allow(null, ''),
});

const listDisputesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'IN_REVIEW', 'RESOLVED').optional(),
});

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

module.exports = {
  createDisputeSchema,
  listDisputesQuerySchema,
  idParamSchema,
};

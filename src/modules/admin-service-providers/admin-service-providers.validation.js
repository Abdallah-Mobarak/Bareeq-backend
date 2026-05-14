const Joi = require('joi');

/**
 * Admin oversight of marketplace Service Providers (FRD §3.2.2 + §2.1).
 *
 * Adds KYC review to the standard listing / block pattern. KYC decision
 * is a single endpoint with `decision` in the body — clearer than two
 * near-identical /approve and /reject endpoints, and easier to extend
 * to additional outcomes later (e.g. NEEDS_RESUBMIT).
 */

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  kycStatus: Joi.string().valid('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED').optional(),
  isVerified: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest', 'name', 'rating', 'pendingFirst').default('newest'),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
  reason: Joi.string().trim().max(500).optional().allow(null, ''),
});

const kycDecisionSchema = Joi.object({
  decision: Joi.string().valid('APPROVED', 'REJECTED').required(),
  notes: Joi.string().trim().max(1000).optional().allow(null, ''),
});

module.exports = {
  idParamSchema,
  listQuerySchema,
  updateStatusSchema,
  kycDecisionSchema,
};

const Joi = require('joi');

/**
 * Admin Disputes — FRD §3.6 marketplace.
 *
 * Admin can list / view all user complaints, set status (Pending →
 * In Review → Resolved), and optionally write back a response.
 *
 * The PATCH body is intentionally lenient: any combination of
 * `status` and `adminResponse` is allowed. The service layer takes
 * care of stamping `respondedByAdminId` / `respondedAt` when a
 * response is added.
 */
const listDisputesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'IN_REVIEW', 'RESOLVED').optional(),
  filerRole: Joi.string().valid('CUSTOMER', 'SERVICE_PROVIDER').optional(),
  q: Joi.string().trim().max(200).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const updateDisputeSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'IN_REVIEW', 'RESOLVED').optional(),
  adminResponse: Joi.string().trim().min(1).max(5000).optional().allow(null, ''),
}).min(1);

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

module.exports = {
  listDisputesQuerySchema,
  updateDisputeSchema,
  idParamSchema,
};

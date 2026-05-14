const Joi = require('joi');

/**
 * Admin oversight of marketplace Customers (FRD §3.2.1).
 *
 * Read-mostly: admin can browse, search, and block/unblock. Admin
 * does NOT edit the customer's name, phone, or password — that's the
 * customer's own responsibility via /customer/profile. The only
 * mutation admins make here is User.status.
 */

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  sort: Joi.string().valid('newest', 'oldest', 'name').default('newest'),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
  reason: Joi.string().trim().max(500).optional().allow(null, ''),
});

module.exports = { idParamSchema, listQuerySchema, updateStatusSchema };

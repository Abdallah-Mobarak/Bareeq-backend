const Joi = require('joi');

/**
 * Service Provider bookings — FRD §2.2 (pool) + §2.3 (assigned).
 *
 * No body for `accept` / `start` / `complete` — they're pure state
 * transitions keyed by the URL id. We still validate the id-param
 * shape for consistency.
 */

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const poolQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  serviceId: Joi.string().optional(),
  sort: Joi.string().valid('oldestFirst', 'newestFirst').default('oldestFirst'),
});

const listMineQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid('APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED')
    .optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

module.exports = { idParamSchema, poolQuerySchema, listMineQuerySchema };

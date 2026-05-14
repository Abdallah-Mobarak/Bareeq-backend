const Joi = require('joi');

/**
 * Notifications — FRD §1.4, §2.4, §3.13, §4.14.
 *
 * Read-mostly module: list, count, mark-read. No POST/DELETE for the
 * recipient — notifications arrive via the internal notify() helper
 * (called from other modules' service layers), not via HTTP.
 */

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  unread: Joi.boolean().optional(),
  type: Joi.string().max(50).optional(),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { listQuerySchema, idParamSchema };

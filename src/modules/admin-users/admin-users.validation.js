const Joi = require('joi');

/**
 * User lookup for the broadcast "Specific Users" picker (Marketplace §3.7).
 *
 * Admins don't know raw user IDs, so the dashboard searches by name /
 * email / phone and lets them pick — the frontend then sends the chosen
 * `id`s to /admin/broadcasts unchanged.
 *
 * Scope is deliberately limited to marketplace end-users (CUSTOMER /
 * SERVICE_PROVIDER): a marketplace admin should not be able to enumerate
 * staff accounts (ADMIN / MANAGER / …).
 */
const lookupQuerySchema = Joi.object({
  q: Joi.string().trim().min(2).max(100).required().messages({
    'string.min': 'Search needs at least 2 characters',
    'any.required': 'A search term (q) is required',
  }),
  role: Joi.string().valid('CUSTOMER', 'SERVICE_PROVIDER').optional(),
  limit: Joi.number().integer().min(1).max(25).default(10),
});

module.exports = { lookupQuerySchema };

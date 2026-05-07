const Joi = require('joi');

/**
 * GET /permissions
 * Default returns the catalog grouped by module (better UX for the
 * admin "pick permissions" form). Pass ?grouped=false for a flat list.
 */
const listPermissionsQuerySchema = Joi.object({
  grouped: Joi.boolean().default(true),
});

module.exports = { listPermissionsQuerySchema };

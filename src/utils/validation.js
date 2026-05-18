const Joi = require('joi');

/**
 * Accept `ids` either as a comma-separated string OR as a repeated query
 * param. Both shapes normalise to `string[]`. Empty / blank entries are
 * stripped.
 *
 * Examples:
 *   ?ids=abc,def,ghi
 *   ?ids[]=abc&ids[]=def&ids[]=ghi
 *
 * Wired into every listQuerySchema that backs an export endpoint, so the
 * FE can ask for "export these specific rows" (one or many) on top of the
 * normal filter query string.
 */
const idsListSchema = Joi.alternatives()
  .try(
    Joi.array().items(Joi.string().trim().min(1)).max(500),
    Joi.string().custom((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
  .optional();

module.exports = { idsListSchema };

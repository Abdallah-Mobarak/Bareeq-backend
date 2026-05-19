const Joi = require('joi');

const LOOKUP_TYPES = [
  'CONTRACT_TYPE',
  'TAX_TYPE',
  'CONTRACT_STATUS',
  'AREA',
  'LICENSE_PLATE',
  'VEHICLE_CONDITION',
];

/**
 * Admin Lookups — FRD §4.9.2 + §4.10.2.
 *
 * Six dropdown sources share one table, discriminated by `type`. All
 * write operations require `type` so admins can't accidentally
 * mis-categorise a row.
 */
const createLookupSchema = Joi.object({
  type: Joi.string()
    .valid(...LOOKUP_TYPES)
    .required(),
  titleAr: Joi.string().trim().min(1).max(200).required(),
  titleEn: Joi.string().trim().max(200).optional().allow(null, ''),
  sortOrder: Joi.number().integer().min(-1000).max(1000).optional(),
});

/**
 * Update is partial — only the fields the admin sends are touched.
 * `type` is omitted on purpose: re-typing a row is destructive (it
 * would orphan every FK pointing at it), so if a row was created in
 * the wrong category, the admin deletes + recreates instead.
 */
const updateLookupSchema = Joi.object({
  titleAr: Joi.string().trim().min(1).max(200).optional(),
  titleEn: Joi.string().trim().max(200).optional().allow(null, ''),
  sortOrder: Joi.number().integer().min(-1000).max(1000).optional(),
}).min(1);

const listLookupsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(50),
  type: Joi.string()
    .valid(...LOOKUP_TYPES)
    .optional(),
  q: Joi.string().trim().max(200).optional().allow(''),
  sort: Joi.string().valid('sortOrder', 'newest', 'oldest', 'name').default('sortOrder'),
});

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

module.exports = {
  LOOKUP_TYPES,
  createLookupSchema,
  updateLookupSchema,
  listLookupsQuerySchema,
  idParamSchema,
};

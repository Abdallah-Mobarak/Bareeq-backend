const Joi = require('joi');

/**
 * Admin Service Types — FRD §4.11.2.
 *
 * Bilingual catalog (Arabic required, English optional) that owns the
 * canonical `hourlyRate` for Representative agreements. Decimal cap is
 * 1,000,000 to match the old per-Representative hourlyRate ceiling and
 * keep currency math predictable.
 */
const fieldRules = {
  nameAr: Joi.string().trim().min(1).max(150),
  nameEn: Joi.string().trim().max(150).allow(null, ''),
  hourlyRate: Joi.number().min(0).max(1_000_000),
};

const createServiceTypeSchema = Joi.object({
  nameAr: fieldRules.nameAr.required(),
  nameEn: fieldRules.nameEn.optional(),
  hourlyRate: fieldRules.hourlyRate.required(),
});

const updateServiceTypeSchema = Joi.object({
  nameAr: fieldRules.nameAr.optional(),
  nameEn: fieldRules.nameEn.optional(),
  hourlyRate: fieldRules.hourlyRate.optional(),
}).min(1);

const listServiceTypesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(150).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'name', 'rate').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createServiceTypeSchema,
  updateServiceTypeSchema,
  listServiceTypesQuerySchema,
  idParamSchema,
};

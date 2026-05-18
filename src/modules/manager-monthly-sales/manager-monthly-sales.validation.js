const Joi = require('joi');

const { idsListSchema } = require('../../utils/validation');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * Shared field rules — keeps the create and update schemas in sync
 * without duplication. We do NOT use Joi's `.fork()` because it strips
 * `.required()` from EVERY field on the partial — we want different
 * required-sets per operation.
 */
const fieldRules = {
  name: Joi.string().trim().min(1).max(200),
  contractType: Joi.string().trim().max(100).allow(null, ''),
  statement: Joi.string().trim().max(500).allow(null, ''),
  website: Joi.string().trim().uri().max(500).allow(null, ''),
  price: Joi.number().min(0).allow(null),
  taxType: Joi.string().trim().max(100).allow(null, ''),
  date: Joi.date().iso(),
  contractStatus: Joi.string().trim().max(100).allow(null, ''),
  notes: Joi.string().trim().max(2000).allow(null, ''),
};

const createClientSchema = Joi.object({
  name: fieldRules.name.required(),
  contractType: fieldRules.contractType.optional(),
  statement: fieldRules.statement.optional(),
  website: fieldRules.website.optional(),
  price: fieldRules.price.optional(),
  taxType: fieldRules.taxType.optional(),
  date: fieldRules.date.required(),
  contractStatus: fieldRules.contractStatus.optional(),
  notes: fieldRules.notes.optional(),
});

const updateClientSchema = Joi.object({
  name: fieldRules.name.optional(),
  contractType: fieldRules.contractType.optional(),
  statement: fieldRules.statement.optional(),
  website: fieldRules.website.optional(),
  price: fieldRules.price.optional(),
  taxType: fieldRules.taxType.optional(),
  date: fieldRules.date.optional(),
  contractStatus: fieldRules.contractStatus.optional(),
  notes: fieldRules.notes.optional(),
}).min(1); // empty PATCH body is a bug — fail fast.

/**
 * Search / filter schema — FRD §3.7.3 (search by name + date) and
 * §3.7.4 (filter by contractType / statement / website / price /
 * taxType / date / contractStatus). We expose price as a range
 * (minPrice/maxPrice) since "filter by price" is most useful as a
 * slider, not a single equality match.
 */
const listClientsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest', 'date', 'name').default('newest'),

  name: Joi.string().trim().max(200).optional(),
  contractType: Joi.string().trim().max(100).optional(),
  statement: Joi.string().trim().max(500).optional(),
  website: Joi.string().trim().max(500).optional(),
  taxType: Joi.string().trim().max(100).optional(),
  contractStatus: Joi.string().trim().max(100).optional(),

  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  ids: idsListSchema,
});

module.exports = {
  idParamSchema,
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
};

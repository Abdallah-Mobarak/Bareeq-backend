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
/**
 * `contractType`, `taxType`, and `contractStatus` are now FKs into
 * the admin-managed Lookup table (FRD §4.9.2). The client sends
 * Lookup IDs (`contractTypeId`, `taxTypeId`, `contractStatusId`);
 * the service layer asserts each id targets a Lookup row of the
 * matching type before saving.
 */
const fieldRules = {
  name: Joi.string().trim().min(1).max(200),
  statement: Joi.string().trim().max(500).allow(null, ''),
  website: Joi.string().trim().uri().max(500).allow(null, ''),
  price: Joi.number().min(0).allow(null),
  date: Joi.date().iso(),
  notes: Joi.string().trim().max(2000).allow(null, ''),
  contractTypeId: Joi.string().trim().min(1).max(40).allow(null, ''),
  taxTypeId: Joi.string().trim().min(1).max(40).allow(null, ''),
  contractStatusId: Joi.string().trim().min(1).max(40).allow(null, ''),
};

const createClientSchema = Joi.object({
  name: fieldRules.name.required(),
  contractTypeId: fieldRules.contractTypeId.optional(),
  statement: fieldRules.statement.optional(),
  website: fieldRules.website.optional(),
  price: fieldRules.price.optional(),
  taxTypeId: fieldRules.taxTypeId.optional(),
  date: fieldRules.date.required(),
  contractStatusId: fieldRules.contractStatusId.optional(),
  notes: fieldRules.notes.optional(),
});

const updateClientSchema = Joi.object({
  name: fieldRules.name.optional(),
  contractTypeId: fieldRules.contractTypeId.optional(),
  statement: fieldRules.statement.optional(),
  website: fieldRules.website.optional(),
  price: fieldRules.price.optional(),
  taxTypeId: fieldRules.taxTypeId.optional(),
  date: fieldRules.date.optional(),
  contractStatusId: fieldRules.contractStatusId.optional(),
  notes: fieldRules.notes.optional(),
}).min(1); // empty PATCH body is a bug — fail fast.

/**
 * Search / filter schema — FRD §3.7.3 (search by name + date) and
 * §3.7.4 (filter). Lookup filters use IDs now; `name` keyword still
 * targets the Client.name string column.
 */
const listClientsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest', 'date', 'name').default('newest'),

  name: Joi.string().trim().max(200).optional(),
  contractTypeId: Joi.string().trim().max(40).optional(),
  statement: Joi.string().trim().max(500).optional(),
  website: Joi.string().trim().max(500).optional(),
  taxTypeId: Joi.string().trim().max(40).optional(),
  contractStatusId: Joi.string().trim().max(40).optional(),

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

const Joi = require('joi');

const { idsListSchema } = require('../../utils/validation');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * Representatives — FRD §3.10.
 *
 * The manager picks a `serviceTypeId` from the admin-managed catalog
 * (FRD §4.11.2). The hourlyRate is read server-side from that row —
 * never accepted from the client — and folded into the computed `price`.
 */
const fieldRules = {
  clientName: Joi.string().trim().min(1).max(200),
  serviceTypeId: Joi.string().trim().min(1).max(40),
  numberOfWorkers: Joi.number().integer().min(1).max(1000),
  numberOfHours: Joi.number().min(0.5).max(10_000),
  dateOfAgreement: Joi.date().iso(),
  customerPhoneNumber: Joi.string().trim().max(25).allow(null, ''),
};

const createRepresentativeSchema = Joi.object({
  clientName: fieldRules.clientName.required(),
  serviceTypeId: fieldRules.serviceTypeId.required(),
  numberOfWorkers: fieldRules.numberOfWorkers.required(),
  numberOfHours: fieldRules.numberOfHours.required(),
  dateOfAgreement: fieldRules.dateOfAgreement.required(),
  customerPhoneNumber: fieldRules.customerPhoneNumber.optional(),
});

const updateRepresentativeSchema = Joi.object({
  clientName: fieldRules.clientName.optional(),
  serviceTypeId: fieldRules.serviceTypeId.optional(),
  numberOfWorkers: fieldRules.numberOfWorkers.optional(),
  numberOfHours: fieldRules.numberOfHours.optional(),
  dateOfAgreement: fieldRules.dateOfAgreement.optional(),
  customerPhoneNumber: fieldRules.customerPhoneNumber.optional(),
}).min(1);

const listRepresentativesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .valid('newest', 'oldest', 'dateOfAgreement', 'price')
    .default('newest'),

  clientName: Joi.string().trim().max(200).optional(),
  serviceTypeId: Joi.string().trim().max(40).optional(),
  customerPhoneNumber: Joi.string().trim().max(25).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  ids: idsListSchema,
});

module.exports = {
  idParamSchema,
  createRepresentativeSchema,
  updateRepresentativeSchema,
  listRepresentativesQuerySchema,
};

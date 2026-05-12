const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

const fieldRules = {
  clientName: Joi.string().trim().min(1).max(200),
  serviceType: Joi.string().trim().min(1).max(150),
  hourlyRate: Joi.number().min(0).max(1_000_000),
  numberOfWorkers: Joi.number().integer().min(1).max(1000),
  numberOfHours: Joi.number().min(0.5).max(10_000),
  dateOfAgreement: Joi.date().iso(),
  customerPhoneNumber: Joi.string().trim().max(25).allow(null, ''),
};

/**
 * Price is NEVER accepted from the client — it's computed on the
 * server. We omit it from both create and update schemas. If a client
 * sends it, Joi's stripUnknown middleware drops it silently.
 */
const createRepresentativeSchema = Joi.object({
  clientName: fieldRules.clientName.required(),
  serviceType: fieldRules.serviceType.required(),
  hourlyRate: fieldRules.hourlyRate.required(),
  numberOfWorkers: fieldRules.numberOfWorkers.required(),
  numberOfHours: fieldRules.numberOfHours.required(),
  dateOfAgreement: fieldRules.dateOfAgreement.required(),
  customerPhoneNumber: fieldRules.customerPhoneNumber.optional(),
});

const updateRepresentativeSchema = Joi.object({
  clientName: fieldRules.clientName.optional(),
  serviceType: fieldRules.serviceType.optional(),
  hourlyRate: fieldRules.hourlyRate.optional(),
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
  serviceType: Joi.string().trim().max(150).optional(),
  customerPhoneNumber: Joi.string().trim().max(25).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  createRepresentativeSchema,
  updateRepresentativeSchema,
  listRepresentativesQuerySchema,
};

const Joi = require('joi');

const { idsListSchema } = require('../../utils/validation');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * `area`, `licensePlate`, and `vehicleCondition` are now FKs into the
 * admin-managed Lookup table (FRD §4.10.2). The manager passes
 * Lookup IDs; the service layer asserts each id targets a Lookup of
 * the correct type before saving.
 */
const fieldRules = {
  supervisorId: Joi.string().trim().min(1).max(40),
  areaId: Joi.string().trim().min(1).max(40),
  licensePlateId: Joi.string().trim().min(1).max(40),
  vehicleConditionId: Joi.string().trim().min(1).max(40),
  oilChangeDate: Joi.date().iso().allow(null),
  notes: Joi.string().trim().max(2000).allow(null, ''),
};

const createCarCaseSchema = Joi.object({
  supervisorId: fieldRules.supervisorId.required(),
  areaId: fieldRules.areaId.required(),
  licensePlateId: fieldRules.licensePlateId.required(),
  vehicleConditionId: fieldRules.vehicleConditionId.required(),
  oilChangeDate: fieldRules.oilChangeDate.optional(),
  notes: fieldRules.notes.optional(),
});

const updateCarCaseSchema = Joi.object({
  supervisorId: fieldRules.supervisorId.optional(),
  areaId: fieldRules.areaId.optional(),
  licensePlateId: fieldRules.licensePlateId.optional(),
  vehicleConditionId: fieldRules.vehicleConditionId.optional(),
  oilChangeDate: fieldRules.oilChangeDate.optional(),
  notes: fieldRules.notes.optional(),
}).min(1);

const listCarCasesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest', 'oilChangeDate').default('newest'),

  supervisorId: Joi.string().trim().max(40).optional(),
  supervisorName: Joi.string().trim().max(100).optional(),
  areaId: Joi.string().trim().max(40).optional(),
  licensePlateId: Joi.string().trim().max(40).optional(),
  vehicleConditionId: Joi.string().trim().max(40).optional(),

  oilChangeDateFrom: Joi.date().iso().optional(),
  oilChangeDateTo: Joi.date().iso().optional(),

  ids: idsListSchema,
});

module.exports = {
  idParamSchema,
  createCarCaseSchema,
  updateCarCaseSchema,
  listCarCasesQuerySchema,
};

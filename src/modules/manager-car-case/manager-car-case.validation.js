const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

const fieldRules = {
  supervisorId: Joi.string().trim().min(1).max(40),
  area: Joi.string().trim().min(1).max(100),
  licensePlate: Joi.string().trim().min(1).max(50),
  vehicleCondition: Joi.string().trim().min(1).max(100),
  oilChangeDate: Joi.date().iso().allow(null),
  notes: Joi.string().trim().max(2000).allow(null, ''),
};

const createCarCaseSchema = Joi.object({
  supervisorId: fieldRules.supervisorId.required(),
  area: fieldRules.area.required(),
  licensePlate: fieldRules.licensePlate.required(),
  vehicleCondition: fieldRules.vehicleCondition.required(),
  oilChangeDate: fieldRules.oilChangeDate.optional(),
  notes: fieldRules.notes.optional(),
});

const updateCarCaseSchema = Joi.object({
  supervisorId: fieldRules.supervisorId.optional(),
  area: fieldRules.area.optional(),
  licensePlate: fieldRules.licensePlate.optional(),
  vehicleCondition: fieldRules.vehicleCondition.optional(),
  oilChangeDate: fieldRules.oilChangeDate.optional(),
  notes: fieldRules.notes.optional(),
}).min(1);

const listCarCasesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest', 'oilChangeDate').default('newest'),

  supervisorId: Joi.string().trim().max(40).optional(),
  supervisorName: Joi.string().trim().max(100).optional(),
  area: Joi.string().trim().max(100).optional(),
  licensePlate: Joi.string().trim().max(50).optional(),
  vehicleCondition: Joi.string().trim().max(100).optional(),

  oilChangeDateFrom: Joi.date().iso().optional(),
  oilChangeDateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  createCarCaseSchema,
  updateCarCaseSchema,
  listCarCasesQuerySchema,
};

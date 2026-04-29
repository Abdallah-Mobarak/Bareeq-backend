const Joi = require('joi');

/**
 * One row in the request body's scheduledVisits array.
 * The system generates `numberOfVisits` VisitInstances from this seed.
 */
const scheduledVisitInputSchema = Joi.object({
  branchId: Joi.string().required(),
  numberOfVisits: Joi.number().integer().min(1).max(4).required(),
  firstVisitDate: Joi.date().iso().required(),
});

/**
 * POST /monthly-schedules
 * Admin assembles a supervisor's whole month in one shot.
 */
const createScheduleSchema = Joi.object({
  supervisorId: Joi.string().required(),
  year: Joi.number().integer().min(2024).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  publish: Joi.boolean().default(false),
  scheduledVisits: Joi.array().items(scheduledVisitInputSchema).min(1).required(),
});

/**
 * PATCH /monthly-schedules/:id
 * Today this only flips publishedAt. Visit edits go through their own
 * endpoints (Day 9). Keeping the surface narrow on purpose.
 */
const updateScheduleSchema = Joi.object({
  publish: Joi.boolean().optional(),
}).min(1);

const listSchedulesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  supervisorId: Joi.string().optional().allow(''),
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  published: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createScheduleSchema,
  updateScheduleSchema,
  listSchedulesQuerySchema,
  idParamSchema,
};

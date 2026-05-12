const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * GET /supervisor/additional-tasks query schema — FRD §1.4.2 + §1.4.3.
 */
const listMyTasksQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('visitDate', 'newest', 'oldest').default('visitDate'),

  companyName: Joi.string().trim().max(150).optional(),
  branchName: Joi.string().trim().max(150).optional(),
  brandName: Joi.string().trim().max(150).optional(),
  address: Joi.string().trim().max(300).optional(),

  status: Joi.string()
    .valid('REMAINING', 'UNDERWAY', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'FINAL_CLOSED')
    .optional(),
  documentationStatus: Joi.string().valid('DOCUMENTED', 'UNDOCUMENTED').optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

/**
 * POST /supervisor/additional-tasks/:id/start body schema — GPS pair.
 * Latitude/longitude are required per FRD §1.4.4.1 ("Location via GPS")
 * even though we don't persist them until Phase C.3. We still validate
 * them so the supervisor app sends consistent data from day one and
 * the column rollout in C.3 doesn't break existing clients.
 */
const startBodySchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

/**
 * POST /supervisor/additional-tasks/:id/not-implemented body schema —
 * a free-text reason for now. Phase C.3 will switch to
 * `notImplementedReasonId` (a FK to the admin-managed Reasons table)
 * once the migration ships.
 */
const notImplementedBodySchema = Joi.object({
  reasonText: Joi.string().trim().min(2).max(500).required(),
});

module.exports = {
  idParamSchema,
  listMyTasksQuerySchema,
  startBodySchema,
  notImplementedBodySchema,
};

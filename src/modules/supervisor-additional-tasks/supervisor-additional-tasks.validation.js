const Joi = require('joi');

const { idsListSchema } = require('../../utils/validation');

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

  // Unified free-text search box on the list screen — matches against
  // company / branch / category / address in one OR group.
  search: Joi.string().trim().max(200).optional().allow(''),

  companyName: Joi.string().trim().max(150).optional(),
  branchName: Joi.string().trim().max(150).optional(),
  brandName: Joi.string().trim().max(150).optional(),
  // Category is free-text on AdditionalTask (FRD §3.9.2, no FK), so the
  // app filters by name rather than a categoryId.
  categoryName: Joi.string().trim().max(150).optional(),
  address: Joi.string().trim().max(300).optional(),

  status: Joi.string()
    .valid('REMAINING', 'UNDERWAY', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'FINAL_CLOSED')
    .optional(),
  documentationStatus: Joi.string().valid('DOCUMENTED', 'UNDOCUMENTED').optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  ids: idsListSchema,
});

/**
 * POST /supervisor/additional-tasks/:id/start body schema — GPS pair
 * (FRD §1.4.4.1 "Location via GPS"). Persisted as startLatitude/Longitude.
 */
const startBodySchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

/** POST /supervisor/additional-tasks/:id/complete — optional "Notes". */
const completeBodySchema = Joi.object({
  note: Joi.string().trim().max(1000).optional().allow(null, ''),
}).default({});

/**
 * POST /supervisor/additional-tasks/:id/not-implemented body schema —
 * `notImplementedReasonId` FKs the admin-managed Reasons table (same as the
 * branch-visit flow). `note` carries the optional "Other → Additional Notes".
 */
const notImplementedBodySchema = Joi.object({
  notImplementedReasonId: Joi.string().trim().min(1).max(40).required(),
  note: Joi.string().trim().max(1000).optional().allow(null, ''),
});

module.exports = {
  idParamSchema,
  listMyTasksQuerySchema,
  startBodySchema,
  completeBodySchema,
  notImplementedBodySchema,
};

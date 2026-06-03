const Joi = require('joi');

/**
 * Mobile schedule list — FRD §1.2.1 + §1.2.2 + §1.2.3.
 *
 * The supervisor's "my month" view. We default to the current month
 * if year/month aren't passed (the mobile app rarely needs a different
 * month; if it does, FE sends them explicitly).
 */
const listMyBranchesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),

  q: Joi.string().trim().max(200).optional().allow(''),

  // Filters mirror admin-side filters (FRD §1.2.3)
  companyName: Joi.string().trim().max(200).optional().allow(''),
  branchName: Joi.string().trim().max(200).optional().allow(''),
  categoryName: Joi.string().trim().max(150).optional().allow(''),
  branchNumber: Joi.string().trim().max(50).optional().allow(''),
  city: Joi.string().trim().max(150).optional().allow(''),
  region: Joi.string().trim().max(150).optional().allow(''),
  code: Joi.string().trim().max(50).optional().allow(''),

  visitType: Joi.number().integer().min(1).max(4).optional(),
  numberOfVisits: Joi.number().integer().min(1).max(4).optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),

  /**
   * "Sort by nearest" — FE sends current GPS, BE sorts by distance.
   * Both must be present, otherwise it's a regular sort.
   */
  nearestLat: Joi.number().min(-90).max(90).optional(),
  nearestLng: Joi.number().min(-180).max(180).optional(),

  sort: Joi.string()
    .valid('newest', 'oldest', 'date', 'nearest')
    .default('date'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

/**
 * GET /supervisor/stats — Monthly Time Distribution filters (FRD §1.3.2):
 * company name / visit type / city / start-end date. Defaults to the current
 * month when year/month are omitted.
 */
const statsQuerySchema = Joi.object({
  companyName: Joi.string().trim().max(200).optional().allow(''),
  city: Joi.string().trim().max(150).optional().allow(''),
  visitType: Joi.number().integer().min(1).max(4).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
});

module.exports = {
  listMyBranchesQuerySchema,
  idParamSchema,
  statsQuerySchema,
};

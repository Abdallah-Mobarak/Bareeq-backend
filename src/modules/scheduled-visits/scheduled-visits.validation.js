const Joi = require('joi');

/**
 * GET /scheduled-visits — FRD §4.2.2.2.2 + §4.2.2.2.4 + §4.2.2.2.5.
 *
 * The flat per-branch view across every monthly schedule. Search and
 * filter cover all the criteria the FRD lists.
 *
 * Notes:
 *   - `q` is the free-text search (supervisor / company / branch /
 *     branchNumber / city / region / code / category).
 *   - Per-field filters are AND'd on top of `q`.
 *   - `dateFrom`/`dateTo` filter visit instances' scheduledDate range.
 *   - `visitType` 1..4 keeps only branches whose numberOfVisits >= n.
 */
const listScheduledVisitsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),

  q: Joi.string().trim().max(200).optional().allow(''),

  // Supervisor filter — by id (preferred) or name match.
  supervisorId: Joi.string().optional().allow(''),
  supervisorName: Joi.string().trim().max(150).optional().allow(''),

  // Branch / company filters
  companyName: Joi.string().trim().max(200).optional().allow(''),
  branchName: Joi.string().trim().max(200).optional().allow(''),
  categoryName: Joi.string().trim().max(150).optional().allow(''),
  branchNumber: Joi.string().trim().max(50).optional().allow(''),
  city: Joi.string().trim().max(150).optional().allow(''),
  region: Joi.string().trim().max(150).optional().allow(''),
  code: Joi.string().trim().max(50).optional().allow(''),

  // Visit-type filter (1..4)
  visitType: Joi.number().integer().min(1).max(4).optional(),

  // Date range — applied against visit_instance.scheduledDate
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  // Schedule-level shortcuts (year / month) — kept for parity with the
  // existing /monthly-schedules query.
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),

  sort: Joi.string().valid('newest', 'oldest', 'date').default('date'),
});

/**
 * GET /scheduled-visits/summary — branch counts per supervisor in a
 * given month. FRD §4.2.2.2.2: "View the total number of branches
 * assigned to a supervisor in the scheduling month."
 *
 * Either provide (supervisorId, year, month) for one row, or just
 * (year, month) to get every supervisor's count.
 */
const summaryQuerySchema = Joi.object({
  supervisorId: Joi.string().optional().allow(''),
  year: Joi.number().integer().min(2024).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required(),
});

module.exports = {
  listScheduledVisitsQuerySchema,
  summaryQuerySchema,
};

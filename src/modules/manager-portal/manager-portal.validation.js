const Joi = require('joi');

/**
 * GET /manager/teams query schema — FRD §3.2.2 (search) + §3.2.3 (filters).
 *
 * The FRD lists the search fields and filter fields with overlap
 * (companyName / supervisorName / city / region). We collapse both
 * into per-field query params — the frontend just sends whichever
 * fields the user has typed into the UI.
 *
 * `year` and `month` are not in the FRD's filter list, but the report
 * is naturally month-scoped. Keeping them optional + defaulting to the
 * current month in the service lets us paginate by month if we ever
 * need to historize without an API change.
 */
const listTeamsQuerySchema = Joi.object({
  companyName: Joi.string().trim().max(100).optional(),
  supervisorName: Joi.string().trim().max(100).optional(),
  city: Joi.string().trim().max(100).optional(),
  region: Joi.string().trim().max(100).optional(),

  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
});

/**
 * URL param schema for any /manager/branches/:id route.
 */
const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * GET /manager/branches query schema — FRD §3.5.3 (search) + §3.5.4 (filter).
 */
const listBranchesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('byDate', 'newest', 'oldest').default('byDate'),

  q: Joi.string().trim().max(100).optional(),

  companyName: Joi.string().trim().max(100).optional(),
  branchName: Joi.string().trim().max(100).optional(),
  categoryName: Joi.string().trim().max(100).optional(),
  branchNumber: Joi.string().trim().max(50).optional(),
  city: Joi.string().trim().max(100).optional(),
  region: Joi.string().trim().max(100).optional(),
  address: Joi.string().trim().max(200).optional(),
  code: Joi.string().trim().max(50).optional(),

  visitType: Joi.number().integer().min(1).max(4).optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
});

/**
 * GET /manager/reports/by-company query schema — FRD §3.6.2.
 * companyName is the only filter the FRD lists; year/month default to
 * the current UTC month if omitted.
 */
const reportByCompanyQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  companyName: Joi.string().trim().max(100).optional(),
});

/**
 * GET /manager/customers query schema — FRD §3.4.2 + §3.4.3.
 * The FRD only allows searching/filtering by company name. year/month
 * default to current UTC month in the service.
 */
const listCustomersQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  companyName: Joi.string().trim().max(100).optional(),
});

/**
 * GET /manager/daily-visits query schema — FRD §3.3.2 + §3.3.3.
 *
 * `startDate` / `endDate` default to "first of this month" / "today"
 * in the service when omitted. We don't enforce startDate <= endDate
 * here because Joi's ref-validation for that case adds noise; the
 * service handles inverted ranges by returning an empty list.
 */
const listDailyVisitsQuerySchema = Joi.object({
  supervisorName: Joi.string().trim().max(100).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

/**
 * Schemas for the three FRD §3.12 endpoints.
 * Kept separate (instead of one shared "month/region" schema) so each
 * endpoint can evolve its own optional filters without surprising the
 * others.
 */
const summaryQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
});

const regionalQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  region: Joi.string().trim().max(100).optional(),
});

const analysisQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  region: Joi.string().trim().max(100).optional(),
});

/**
 * Additional Tasks schemas — FRD §3.9.
 *
 * `createAdditionalTaskSchema` is the strict version (required fields).
 * `updateAdditionalTaskSchema` makes everything optional so PATCH can
 * change a single field without re-sending the whole record.
 */
const createAdditionalTaskSchema = Joi.object({
  supervisorId: Joi.string().trim().min(1).max(40).required(),
  companyName: Joi.string().trim().min(1).max(150).required(),
  branchName: Joi.string().trim().max(150).optional().allow(null, ''),
  categoryName: Joi.string().trim().max(150).optional().allow(null, ''),
  address: Joi.string().trim().min(1).max(300).required(),
  location: Joi.string().trim().max(500).optional().allow(null, ''),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
  visitDate: Joi.date().iso().required(),
  price: Joi.number().min(0).optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow(null, ''),
});

const updateAdditionalTaskSchema = Joi.object({
  supervisorId: Joi.string().trim().min(1).max(40).optional(),
  companyName: Joi.string().trim().min(1).max(150).optional(),
  branchName: Joi.string().trim().max(150).optional().allow(null, ''),
  categoryName: Joi.string().trim().max(150).optional().allow(null, ''),
  address: Joi.string().trim().min(1).max(300).optional(),
  location: Joi.string().trim().max(500).optional().allow(null, ''),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
  visitDate: Joi.date().iso().optional(),
  price: Joi.number().min(0).optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow(null, ''),
})
  .min(1); // PATCH with empty body is almost certainly a bug — fail fast.

const listAdditionalTasksQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest', 'visitDate').default('newest'),

  // Search (FRD §3.9.3)
  supervisorId: Joi.string().trim().max(40).optional(),
  supervisorName: Joi.string().trim().max(100).optional(),
  companyName: Joi.string().trim().max(150).optional(),
  branchName: Joi.string().trim().max(150).optional(),
  brandName: Joi.string().trim().max(150).optional(),
  address: Joi.string().trim().max(300).optional(),

  // Filter (FRD §3.9.4)
  status: Joi.string()
    .valid('REMAINING', 'UNDERWAY', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'FINAL_CLOSED')
    .optional(),
  documentationStatus: Joi.string().valid('DOCUMENTED', 'UNDOCUMENTED').optional(),

  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  listTeamsQuerySchema,
  idParamSchema,
  listBranchesQuerySchema,
  reportByCompanyQuerySchema,
  listCustomersQuerySchema,
  listDailyVisitsQuerySchema,
  summaryQuerySchema,
  regionalQuerySchema,
  analysisQuerySchema,
  createAdditionalTaskSchema,
  updateAdditionalTaskSchema,
  listAdditionalTasksQuerySchema,
};

const Joi = require('joi');

/**
 * URL param schema reused by every /company/branches/:id route.
 * cuid is 25 chars; we allow 1–40 to keep the door open for future
 * id strategies without forcing another migration of the schema.
 */
const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

/**
 * GET /company/branches query schema — FRD §2.2.1 / §2.2.2 / §2.2.3.
 *
 * Defaults:
 *   • page=1, limit=20 — typical mobile-friendly pagination.
 *   • sort=byDate     — FRD §2.2.1 lists visits chronologically by default.
 *   • year/month absent → service falls back to the current UTC month.
 *
 * `visitStatus` accepts the FRD's UI labels mapped 1-to-1 to our enum,
 * plus the FRD's "No Action" which we translate to REMAINING inside the
 * service. Keeping the UI vocabulary in the API contract makes the
 * frontend code read like the spec.
 */
const listBranchesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('byDate', 'newest', 'oldest').default('byDate'),

  // Free-text search across multiple fields (FRD §2.2.2).
  q: Joi.string().trim().max(100).optional(),

  // Per-field filters (FRD §2.2.3).
  branchName: Joi.string().trim().max(100).optional(),
  categoryName: Joi.string().trim().max(100).optional(),
  branchNumber: Joi.string().trim().max(50).optional(),
  city: Joi.string().trim().max(100).optional(),
  region: Joi.string().trim().max(100).optional(),
  address: Joi.string().trim().max(200).optional(),
  code: Joi.string().trim().max(50).optional(),

  // Numeric filters.
  visitType: Joi.number().integer().min(1).max(4).optional(),
  numberOfVisits: Joi.number().integer().min(1).max(4).optional(),

  // Date-range filter on visit instances.
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),

  // Month selection (defaults to current month if both omitted).
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),

  // Visit status filter (FRD §2.2.3).
  visitStatus: Joi.string()
    .valid('REMAINING', 'UNDERWAY', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'FINAL_CLOSED', 'NO_ACTION')
    .optional(),
});

/**
 * GET /company/monthly-report query schema — FRD §2.3.2.
 *
 * Both fields are optional; the service falls back to the current UTC
 * month when either is missing. We accept them independently so a
 * client can query "all months of 2026" if we later add a year-wide
 * view, without changing the schema.
 */
const monthlyReportQuerySchema = Joi.object({
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
});

/**
 * POST /company/contact body schema — FRD §2.4 + FR-65.
 *
 *   • email   → Joi.string().email() (Joi's email regex; we accept
 *     internal TLDs to match the rest of the codebase's choice).
 *   • phone   → free-text 6–25 chars. Saudi phones come in many shapes
 *     (+966…, 05…, 9665…), so we don't pin a single regex per the same
 *     reasoning as the login schema.
 *   • message → 5–2000 chars. Lower bound prevents accidental empty
 *     submissions; upper bound caps storage and rendering cost.
 */
const submitContactSchema = Joi.object({
  email: Joi.string().email({ tlds: false }).max(150).required(),
  phone: Joi.string().trim().min(6).max(25).required(),
  message: Joi.string().trim().min(5).max(2000).required(),
});

/**
 * GET /company/contact/my-messages query schema — simple pagination.
 * Defaults mirror the rest of the portal (page=1, limit=20).
 */
const listContactMessagesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  idParamSchema,
  listBranchesQuerySchema,
  monthlyReportQuerySchema,
  submitContactSchema,
  listContactMessagesQuerySchema,
};

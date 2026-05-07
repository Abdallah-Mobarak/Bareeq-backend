const Joi = require('joi');

/**
 * Required tasks for a region scheduling row, grouped by visit type.
 * `visitType` 1..4 must align with the parent's `numberOfVisits`
 * (validated at service layer for cross-field reasoning).
 */
const requiredTaskSchema = Joi.object({
  visitType: Joi.number().integer().min(1).max(4).required(),
  titleAr: Joi.string().trim().min(1).max(300).required(),
  titleEn: Joi.string().trim().max(300).optional().allow(null, ''),
  sortOrder: Joi.number().integer().min(0).optional(),
});

/**
 * `location` is free text the admin pastes from Excel — typically a
 * Google Maps URL (`https://maps.google.com/?q=24.7,46.7`,
 * `https://www.google.com/maps/place/.../@24.7,46.7,17z/`) or just
 * "lat,lng". The service extracts numeric latitude/longitude on save.
 *
 * `latitude` / `longitude` are intentionally NOT accepted from the
 * client anymore — they're derived from `location`.
 */
const createSchema = Joi.object({
  companyName: Joi.string().trim().min(1).max(200).required(),
  branchName: Joi.string().trim().min(1).max(200).required(),
  categoryName: Joi.string().trim().max(150).optional().allow(null, ''),
  branchNumber: Joi.string().trim().max(50).optional().allow(null, ''),
  city: Joi.string().trim().min(1).max(150).required(),
  region: Joi.string().trim().min(1).max(150).required(),
  address: Joi.string().trim().max(500).optional().allow(null, ''),
  location: Joi.string().trim().max(1000).optional().allow(null, ''),
  numberOfVisits: Joi.number().integer().min(1).max(4).required(),
  code: Joi.string().trim().max(50).optional().allow(null, ''),
  requiredTasks: Joi.array().items(requiredTaskSchema).max(50).default([]),
});

const updateSchema = Joi.object({
  companyName: Joi.string().trim().min(1).max(200).optional(),
  branchName: Joi.string().trim().min(1).max(200).optional(),
  categoryName: Joi.string().trim().max(150).optional().allow(null, ''),
  branchNumber: Joi.string().trim().max(50).optional().allow(null, ''),
  city: Joi.string().trim().min(1).max(150).optional(),
  region: Joi.string().trim().min(1).max(150).optional(),
  address: Joi.string().trim().max(500).optional().allow(null, ''),
  location: Joi.string().trim().max(1000).optional().allow(null, ''),
  numberOfVisits: Joi.number().integer().min(1).max(4).optional(),
  code: Joi.string().trim().max(50).optional().allow(null, ''),
  requiredTasks: Joi.array().items(requiredTaskSchema).max(50).optional(),
}).min(1);

/**
 * GET /region-schedulings — query string.
 * Filters mirror FRD §1.6 + §1.7 (filter + search criteria).
 */
const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  region: Joi.string().trim().max(150).optional().allow(''),
  companyName: Joi.string().trim().max(200).optional().allow(''),
  branchName: Joi.string().trim().max(200).optional().allow(''),
  categoryName: Joi.string().trim().max(150).optional().allow(''),
  branchNumber: Joi.string().trim().max(50).optional().allow(''),
  city: Joi.string().trim().max(150).optional().allow(''),
  visitType: Joi.number().integer().min(1).max(4).optional(),
  code: Joi.string().trim().max(50).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const SUPPORTED_LOCATION_HINT =
  'Paste a Google Maps URL (e.g. https://maps.google.com/?q=24.7,46.7) or "lat,lng".';

module.exports.SUPPORTED_LOCATION_HINT = SUPPORTED_LOCATION_HINT;

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSchema,
  updateSchema,
  listQuerySchema,
  idParamSchema,
};

const Joi = require('joi');

/**
 * Loose phone validation. Saudi numbers come in many shapes
 * (+966, 966, 05, 5, 0...) and the FRD does not pin one format down.
 * We accept anything that looks phone-ish; tighten later if business
 * requires a single canonical shape.
 */
const phoneSchema = Joi.string()
  .trim()
  .min(9)
  .max(20)
  .pattern(/^[+0-9\s-]+$/);

/**
 * POST /managers
 * Admin creates a new manager. Email + phone must be unique across the
 * entire users table; the service enforces that.
 */
const createManagerSchema = Joi.object({
  email: Joi.string()
    .lowercase()
    .trim()
    .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
    .messages({ 'string.pattern.base': '"email" must be a valid email' })
    .required(),
  phone: phoneSchema.required(),
  password: Joi.string().min(8).max(100).required(),
  nameAr: Joi.string().trim().min(2).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  permissionRoleId: Joi.string().optional().allow(null, ''),
});

/**
 * PATCH /managers/:id
 * Profile fields only. Password and status have dedicated endpoints
 * because they have side effects (revoke sessions).
 */
const updateManagerSchema = Joi.object({
  email: Joi.string()
    .lowercase()
    .trim()
    .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
    .messages({ 'string.pattern.base': '"email" must be a valid email' })
    .optional(),
  phone: phoneSchema.optional(),
  nameAr: Joi.string().trim().min(2).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  permissionRoleId: Joi.string().optional().allow(null, ''),
}).min(1); // at least one field required

/**
 * PATCH /managers/:id/password
 */
const changePasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(100).required(),
});

/**
 * PATCH /managers/:id/status
 */
const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
});

/**
 * GET /managers — query string
 */
const listManagersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  permissionRoleId: Joi.string().optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

/**
 * Used wherever a route reads :id from req.params.
 */
const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createManagerSchema,
  updateManagerSchema,
  changePasswordSchema,
  updateStatusSchema,
  listManagersQuerySchema,
  idParamSchema,
};

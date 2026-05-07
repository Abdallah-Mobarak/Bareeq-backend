const Joi = require('joi');

const phoneSchema = Joi.string()
  .trim()
  .min(9)
  .max(20)
  .pattern(/^[+0-9\s-]+$/);

const emailSchema = Joi.string()
  .lowercase()
  .trim()
  .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
  .messages({ 'string.pattern.base': '"email" must be a valid email' });

const createSchema = Joi.object({
  email: emailSchema.required(),
  phone: phoneSchema.optional().allow(null, ''),
  password: Joi.string().min(8).max(100).required(),
  nameAr: Joi.string().trim().min(2).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  permissionRoleId: Joi.string().optional().allow(null, ''),
});

const updateSchema = Joi.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional().allow(null, ''),
  nameAr: Joi.string().trim().min(2).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  permissionRoleId: Joi.string().optional().allow(null, ''),
}).min(1);

const changePasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(100).required(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  permissionRoleId: Joi.string().optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

/**
 * "Update own profile" payload — FRD §4.1.
 * Password changes go through a separate schema because the user must
 * confirm their current password.
 */
const updateOwnProfileSchema = Joi.object({
  email: emailSchema.optional(),
  nameAr: Joi.string().trim().min(2).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
}).min(1);

const changeOwnPasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(100).required(),
  newPassword: Joi.string().min(8).max(100).required(),
});

module.exports = {
  createSchema,
  updateSchema,
  changePasswordSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
};

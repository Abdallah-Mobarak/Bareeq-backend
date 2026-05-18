const Joi = require('joi');

const { idsListSchema } = require('../../utils/validation');

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

/**
 * PATCH /companies/:id
 * Updates the company entity. The login user is updated via separate
 * endpoints (similar to managers/supervisors).
 */
const updateCompanySchema = Joi.object({
  nameAr: Joi.string().trim().min(2).max(200).optional(),
  nameEn: Joi.string().trim().max(200).optional().allow(null, ''),
  contactEmail: emailSchema.optional().allow(null, ''),
  contactPhone: phoneSchema.optional().allow(null, ''),
}).min(1);

const updateLoginSchema = Joi.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
}).min(1);

const changePasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(100).required(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
});

const listCompaniesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  ids: idsListSchema,
  sort: Joi.string().valid('newest', 'oldest', 'name').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  updateCompanySchema,
  updateLoginSchema,
  changePasswordSchema,
  updateStatusSchema,
  listCompaniesQuerySchema,
  idParamSchema,
};

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
 * POST /supervisors
 * Supervisors don't have a permissionRole — their capabilities are
 * fixed in the FRD (mobile app, scheduled visits, etc.)
 */
const createSupervisorSchema = Joi.object({
  email: emailSchema.required(),
  phone: phoneSchema.required(),
  password: Joi.string().min(8).max(100).required(),
  nameAr: Joi.string().trim().min(2).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
});

const updateSupervisorSchema = Joi.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  nameAr: Joi.string().trim().min(2).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
}).min(1);

const changePasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(100).required(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('ENABLED', 'BLOCKED').required(),
});

const listSupervisorsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  ids: idsListSchema,
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSupervisorSchema,
  updateSupervisorSchema,
  changePasswordSchema,
  updateStatusSchema,
  listSupervisorsQuerySchema,
  idParamSchema,
};

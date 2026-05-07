const Joi = require('joi');

const phoneSchema = Joi.string()
  .trim()
  .min(9)
  .max(20)
  .pattern(/^[+0-9\s-]+$/);

const createSchema = Joi.object({
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
  companyId: Joi.string().required(),
  assignedToAllBranches: Joi.boolean().default(false),
  /**
   * Required when assignedToAllBranches=false; ignored otherwise.
   * Service layer enforces the cross-field rule.
   */
  regionSchedulingIds: Joi.array().items(Joi.string()).default([]),
});

const updateSchema = Joi.object({
  email: Joi.string()
    .lowercase()
    .trim()
    .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
    .messages({ 'string.pattern.base': '"email" must be a valid email' })
    .optional(),
  phone: phoneSchema.optional(),
  nameAr: Joi.string().trim().min(2).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  assignedToAllBranches: Joi.boolean().optional(),
  regionSchedulingIds: Joi.array().items(Joi.string()).optional(),
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
  companyId: Joi.string().optional().allow(''),
  status: Joi.string().valid('ENABLED', 'BLOCKED').optional(),
  assignedToAllBranches: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSchema,
  updateSchema,
  changePasswordSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
};

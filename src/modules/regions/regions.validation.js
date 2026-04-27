const Joi = require('joi');

const createRegionSchema = Joi.object({
  nameAr: Joi.string().trim().min(1).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
});

const updateRegionSchema = Joi.object({
  nameAr: Joi.string().trim().min(1).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
}).min(1);

const listRegionsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'name').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createRegionSchema,
  updateRegionSchema,
  listRegionsQuerySchema,
  idParamSchema,
};

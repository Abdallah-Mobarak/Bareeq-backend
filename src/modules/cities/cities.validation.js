const Joi = require('joi');

const createCitySchema = Joi.object({
  regionId: Joi.string().required(),
  nameAr: Joi.string().trim().min(1).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
});

const updateCitySchema = Joi.object({
  regionId: Joi.string().optional(),
  nameAr: Joi.string().trim().min(1).max(150).optional(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
}).min(1);

const listCitiesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  regionId: Joi.string().optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'name').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createCitySchema,
  updateCitySchema,
  listCitiesQuerySchema,
  idParamSchema,
};

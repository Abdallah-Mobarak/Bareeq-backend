const Joi = require('joi');

const createReasonSchema = Joi.object({
  titleAr: Joi.string().trim().min(1).max(255).required(),
  titleEn: Joi.string().trim().max(255).optional().allow(null, ''),
});

const updateReasonSchema = Joi.object({
  titleAr: Joi.string().trim().min(1).max(255).optional(),
  titleEn: Joi.string().trim().max(255).optional().allow(null, ''),
}).min(1);

const listReasonsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'title').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createReasonSchema,
  updateReasonSchema,
  listReasonsQuerySchema,
  idParamSchema,
};

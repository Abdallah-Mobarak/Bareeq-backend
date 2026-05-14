const Joi = require('joi');

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  serviceId: Joi.string().optional(),
  serviceProviderId: Joi.string().optional(),
  customerId: Joi.string().optional(),
  minRating: Joi.number().integer().min(1).max(5).optional(),
  maxRating: Joi.number().integer().min(1).max(5).optional(),
  sort: Joi.string().valid('newest', 'oldest', 'ratingHigh', 'ratingLow').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { listQuerySchema, idParamSchema };

const Joi = require('joi');

const createSchema = Joi.object({
  managerId: Joi.string().required(),
  title: Joi.string().trim().min(1).max(300).required(),
  description: Joi.string().trim().max(2000).optional().allow(null, ''),
});

const updateSchema = Joi.object({
  managerId: Joi.string().optional(),
  title: Joi.string().trim().min(1).max(300).optional(),
  description: Joi.string().trim().max(2000).optional().allow(null, ''),
}).min(1);

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  managerId: Joi.string().optional().allow(''),
  done: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const myListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  done: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const setStatusSchema = Joi.object({
  done: Joi.boolean().required(),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSchema,
  updateSchema,
  listQuerySchema,
  myListQuerySchema,
  setStatusSchema,
  idParamSchema,
};

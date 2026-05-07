const Joi = require('joi');

const permissionKeysSchema = Joi.array()
  .items(Joi.string().trim().uppercase().max(80))
  .unique()
  .max(100);

/**
 * FRD §4.2.1.2 / §4.2.3.2:
 *   "When adding or updating a role, the admin must provide:
 *    - Role Name
 *    - Select permissions for this role"
 * Nothing else.
 */
const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  permissionKeys: permissionKeysSchema.default([]),
});

const updateRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  permissionKeys: permissionKeysSchema.optional(),
}).min(1);

const listRolesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createRoleSchema,
  updateRoleSchema,
  listRolesQuerySchema,
  idParamSchema,
};

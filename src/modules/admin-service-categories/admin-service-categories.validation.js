const Joi = require('joi');

/**
 * Admin ServiceCategory CRUD — Marketplace §3.4 + §1.2.3.
 *
 * `iconUrl` is left as a plain URL string for now; the upload pipeline
 * (multer + storage) will be added when SP profile pictures are wired,
 * since both consume the same plumbing.
 */

const titleArField = Joi.string().trim().min(2).max(100);
const titleEnField = Joi.string().trim().min(2).max(100).allow(null, '');
const iconUrlField = Joi.string().trim().uri().max(1024).allow(null, '');
const isActiveField = Joi.boolean();
const sortOrderField = Joi.number().integer().min(0).max(100000);

const createSchema = Joi.object({
  titleAr: titleArField.required(),
  titleEn: titleEnField.optional(),
  iconUrl: iconUrlField.optional(),
  isActive: isActiveField.optional(),
  sortOrder: sortOrderField.optional(),
});

/**
 * PATCH semantics: only the fields the admin sends are touched. All
 * fields are optional, but the body cannot be empty (else there's
 * nothing to do — surface that as 400).
 */
const updateSchema = Joi.object({
  titleAr: titleArField.optional(),
  titleEn: titleEnField.optional(),
  iconUrl: iconUrlField.optional(),
  isActive: isActiveField.optional(),
  sortOrder: sortOrderField.optional(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field is required to update' });

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  isActive: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest', 'sortOrder', 'name').default('sortOrder'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSchema,
  updateSchema,
  listQuerySchema,
  idParamSchema,
};

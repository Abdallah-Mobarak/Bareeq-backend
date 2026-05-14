const Joi = require('joi');

/**
 * Admin Service CRUD — Marketplace §3.4.1.
 *
 * Nesting policy on update:
 *   - The PATCH body may include a `subcategories` array. If present,
 *     it REPLACES the existing list (soft-delete all old rows, create
 *     new). If absent, subcategories are left untouched.
 *   - This trades atomicity for simplicity: one round-trip from the
 *     admin UI replaces the whole nested list. Add/remove-individual
 *     endpoints can come later if granular history is needed.
 *
 * Commission rate has its own PATCH endpoint (§3.4.1.5 calls it a
 * separate "Manage Commission Rates" screen). Body field still lives
 * on the same record, but the URL split makes intent explicit.
 */

const titleArField = Joi.string().trim().min(2).max(100);
const titleEnField = Joi.string().trim().min(2).max(100).allow(null, '');
const descriptionField = Joi.string().trim().max(2000).allow(null, '');
const imageUrlField = Joi.string().trim().uri().max(1024).allow(null, '');
const categoryIdField = Joi.string().min(1);
const commissionRateField = Joi.number().min(0).max(100).precision(2);
const isActiveField = Joi.boolean();
const sortOrderField = Joi.number().integer().min(0).max(100000);

const subcategorySchema = Joi.object({
  titleAr: titleArField.required(),
  titleEn: titleEnField.optional(),
  cost: Joi.number().min(0).precision(2).required(),
  sortOrder: sortOrderField.optional(),
});

const createSchema = Joi.object({
  categoryId: categoryIdField.required(),
  titleAr: titleArField.required(),
  titleEn: titleEnField.optional(),
  descriptionAr: descriptionField.optional(),
  descriptionEn: descriptionField.optional(),
  imageUrl: imageUrlField.optional(),
  commissionRate: commissionRateField.optional(),
  isActive: isActiveField.optional(),
  sortOrder: sortOrderField.optional(),
  subcategories: Joi.array().items(subcategorySchema).max(50).optional(),
});

const updateSchema = Joi.object({
  categoryId: categoryIdField.optional(),
  titleAr: titleArField.optional(),
  titleEn: titleEnField.optional(),
  descriptionAr: descriptionField.optional(),
  descriptionEn: descriptionField.optional(),
  imageUrl: imageUrlField.optional(),
  isActive: isActiveField.optional(),
  sortOrder: sortOrderField.optional(),
  // omit commissionRate here — handled by its dedicated endpoint.
  subcategories: Joi.array().items(subcategorySchema).max(50).optional(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field is required to update' });

const updateCommissionSchema = Joi.object({
  commissionRate: commissionRateField.required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  categoryId: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  sort: Joi.string().valid('newest', 'oldest', 'sortOrder', 'name', 'rating').default('sortOrder'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createSchema,
  updateSchema,
  updateCommissionSchema,
  listQuerySchema,
  idParamSchema,
};

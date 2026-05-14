const Joi = require('joi');

/**
 * Customer Home (Marketplace §1.2). Read-only browsing for a
 * logged-in CUSTOMER. All inputs come via query params.
 *
 * Cost-range filter is FRD-mandated (§1.2.4). Cost lives on Subcategory,
 * so "service cost" = SUM of its subcategories. We apply the range
 * filter in-memory after fetch (acceptable for the MVP catalog size;
 * denormalise to a `service.totalCost` column when this becomes a hot
 * path).
 */

const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

const categoriesListSchema = Joi.object({
  ...paginationFields,
});

const servicesListSchema = Joi.object({
  ...paginationFields,
  q: Joi.string().trim().max(100).optional().allow(''),
  categoryId: Joi.string().optional(),
  // Rating Range filter — §1.2.4
  minRating: Joi.number().min(0).max(5).optional(),
  maxRating: Joi.number().min(0).max(5).optional(),
  // Cost Range filter — §1.2.4 (sum of subcategories)
  minCost: Joi.number().min(0).optional(),
  maxCost: Joi.number().min(0).optional(),
  sort: Joi.string()
    .valid('sortOrder', 'rating', 'newest', 'priceAsc', 'priceDesc')
    .default('sortOrder'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { categoriesListSchema, servicesListSchema, idParamSchema };

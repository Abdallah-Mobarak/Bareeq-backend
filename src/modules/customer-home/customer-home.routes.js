const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-home.controller');
const {
  categoriesListSchema,
  servicesListSchema,
  idParamSchema,
  reviewsListQuerySchema,
} = require('./customer-home.validation');

const router = Router();

/**
 * Customer Home (Marketplace §1.2). Read-only browsing for an
 * authenticated CUSTOMER. Mounted at /customer/home.
 */
router.use(requireAuth, requireRole('CUSTOMER'));

router.get('/categories', validate(categoriesListSchema, 'query'), controller.listCategories);
router.get('/services', validate(servicesListSchema, 'query'), controller.listServices);
router.get('/services/:id', validate(idParamSchema, 'params'), controller.getServiceDetail);
router.get(
  '/services/:id/reviews',
  validate(idParamSchema, 'params'),
  validate(reviewsListQuerySchema, 'query'),
  controller.listServiceReviews,
);

module.exports = router;

const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-reviews.controller');
const { createSchema, idParamSchema } = require('./customer-reviews.validation');

/**
 * Customer review submission — mounted UNDER /customer/bookings/:id so
 * the URL says "this review belongs to this booking" explicitly.
 *
 * mergeParams: true lets us read :id from the parent router's path.
 */
const router = Router({ mergeParams: true });

router.use(requireAuth, requireRole('CUSTOMER'));

router.post('/', validate(idParamSchema, 'params'), validate(createSchema), controller.submit);
router.get('/', validate(idParamSchema, 'params'), controller.getMine);

module.exports = router;

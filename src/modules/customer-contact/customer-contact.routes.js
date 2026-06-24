const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./customer-contact.controller');
const {
  submitContactSchema,
  listContactMessagesQuerySchema,
} = require('./customer-contact.validation');

const router = Router();

// Customer Contact-Us — mirror of /company/contact for the CUSTOMER surface.
// Mounted at /customer/contact in src/routes/index.js.
router.use(requireAuth, requireRole('CUSTOMER'));

router.post('/', validate(submitContactSchema), controller.submitContact);
router.get(
  '/my-messages',
  validate(listContactMessagesQuerySchema, 'query'),
  controller.listMyMessages,
);

module.exports = router;

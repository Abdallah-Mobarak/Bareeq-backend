const { Router } = require('express');

const controller = require('./paytabs-webhook.controller');

const router = Router();

/**
 * PayTabs hosted-payment callbacks. PUBLIC — PayTabs (and the customer's
 * browser) hit these, not the app. Mounted at /payments/paytabs in
 * src/routes/index.js. The callback is authenticated by HMAC signature,
 * not by a customer token.
 */
router.post('/callback', controller.handleCallback);
router.get('/return', controller.handleReturn);

module.exports = router;

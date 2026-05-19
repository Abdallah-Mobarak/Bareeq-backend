const { Router } = require('express');

const controller = require('./system-settings.controller');

const router = Router();

/**
 * Truly public — no auth, no role gate. Privacy Policy and admin
 * contact info must be readable BEFORE the user signs up (FRD §1.1
 * marketplace). The service layer hard-codes the whitelist of keys
 * that ever leave this endpoint.
 */
router.get('/public', controller.getPublic);

module.exports = router;

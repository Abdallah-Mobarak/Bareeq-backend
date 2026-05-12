const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const { loginSchema, refreshTokenSchema } = require('./auth.validation');
const controller = require('./auth.controller');

const router = Router();

/**
 * Public endpoints — no auth header required.
 *
 * Login is split by surface so the URL itself encodes which client is
 * connecting:
 *   /auth/web/login    → admin / manager / company / accountant manager
 *   /auth/mobile/login → supervisor
 * The service rejects roles that try to log in from the wrong surface
 * (see ROLE_CLIENT_MAP in auth.service.js).
 *
 * /refresh and /logout are surface-agnostic — once you have a refresh
 * token, the source of the original login is irrelevant.
 */
router.post('/web/login', validate(loginSchema), controller.webLogin);
router.post('/mobile/login', validate(loginSchema), controller.mobileLogin);
router.post('/refresh', validate(refreshTokenSchema), controller.refresh);
router.post('/logout', validate(refreshTokenSchema), controller.logout);

/**
 * Protected endpoints — require a valid access token.
 */
router.get('/me', requireAuth, controller.me);

module.exports = router;

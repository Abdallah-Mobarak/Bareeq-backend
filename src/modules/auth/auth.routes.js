const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const { loginSchema, refreshTokenSchema } = require('./auth.validation');
const controller = require('./auth.controller');

const router = Router();

/**
 * Public endpoints — no auth header required.
 * /login establishes a session, /refresh rotates it, /logout ends it.
 */
router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', validate(refreshTokenSchema), controller.refresh);
router.post('/logout', validate(refreshTokenSchema), controller.logout);

/**
 * Protected endpoints — require a valid access token.
 */
router.get('/me', requireAuth, controller.me);

module.exports = router;

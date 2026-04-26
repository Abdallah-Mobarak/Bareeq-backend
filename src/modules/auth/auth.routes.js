const { Router } = require('express');

const validate = require('../../middlewares/validate');
const { loginSchema } = require('./auth.validation');
const controller = require('./auth.controller');

const router = Router();

/**
 * Public routes — no auth middleware. The login endpoint is the door.
 */
router.post('/login', validate(loginSchema), controller.login);

module.exports = router;

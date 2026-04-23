const { Router } = require('express');

const router = Router();

/**
 * Root API router.
 *
 * As we build modules, we mount them here. Example:
 *   router.use('/auth', require('../modules/auth/auth.routes'));
 *   router.use('/users', require('../modules/users/users.routes'));
 *
 * Keep this file free of business logic — it's just a table of contents.
 */

router.get('/', (req, res) => {
  res.json({
    message: 'Bareeq API',
    version: '0.1.0',
    phase: 'Bootstrap',
  });
});

module.exports = router;

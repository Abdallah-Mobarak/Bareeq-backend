const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const controller = require('./notifications.controller');
const { listQuerySchema, idParamSchema } = require('./notifications.validation');

const router = Router();

/**
 * Any authenticated user can read their own notifications — no
 * requireRole here. The userId scoping in the service layer keeps
 * users from seeing each other's inboxes.
 */
router.use(requireAuth);

// Unread count comes first so it's not shadowed by /:id
router.get('/unread-count', controller.unreadCount);

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validate(idParamSchema, 'params'), controller.markRead);

module.exports = router;

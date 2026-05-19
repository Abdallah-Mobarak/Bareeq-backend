const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./admin-system-settings.controller');
const {
  keyParamSchema,
  upsertSettingSchema,
} = require('./admin-system-settings.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', controller.list);
router.get('/:key', validate(keyParamSchema, 'params'), controller.getOne);

/**
 * PUT (not POST or PATCH): the verb is idempotent — same payload
 * twice yields the same state. Caller doesn't need to know whether
 * the key exists; the service upserts.
 */
router.put(
  '/:key',
  validate(keyParamSchema, 'params'),
  validate(upsertSettingSchema),
  controller.upsert,
);

router.delete('/:key', validate(keyParamSchema, 'params'), controller.remove);

module.exports = router;

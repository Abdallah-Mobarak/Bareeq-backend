const Joi = require('joi');

/**
 * Admin System Settings — FRD §4.1 ("Admin can add or update Privacy
 * Policy") + the contact-info side of §1.1 / §2.1 marketplace and
 * §2.4 management.
 *
 * Keys are an open set: the admin can manage any key the UI exposes.
 * We constrain shape (alphanumeric + underscore) so URLs and DB
 * lookups stay predictable, but we don't enumerate them — adding a
 * new key shouldn't require a code change.
 */
const keyParamSchema = Joi.object({
  key: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-z][a-z0-9_]*$/)
    .required()
    .messages({
      'string.pattern.base':
        'key must be lowercase letters, digits, and underscores (must start with a letter)',
    }),
});

const upsertSettingSchema = Joi.object({
  value: Joi.string().min(0).max(50_000).required().allow(''),
});

module.exports = { keyParamSchema, upsertSettingSchema };

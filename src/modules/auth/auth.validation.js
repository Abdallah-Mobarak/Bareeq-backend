const Joi = require('joi');

/**
 * POST /auth/login
 * Body: { identifier, password, deviceInfo? }
 *
 * `identifier` is either an email or a phone number; the service decides
 * which by checking for an `@`. We don't enforce a phone format here
 * because Saudi phone formats vary (+966, 05, etc.) and the FRD does not
 * pin a single shape down.
 */
const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(3).max(100).required(),
  password: Joi.string().min(6).max(100).required(),
  deviceInfo: Joi.string().max(255).optional().allow(null, ''),
});

module.exports = { loginSchema };

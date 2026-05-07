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
/**
 * `clientType` distinguishes which client is logging in. Used to enforce
 * "supervisors are mobile-only" — see auth.service.js. Defaults to "web"
 * for backward compatibility (existing dashboard requests don't send it).
 */
const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(3).max(100).required(),
  password: Joi.string().min(6).max(100).required(),
  deviceInfo: Joi.string().max(255).optional().allow(null, ''),
  clientType: Joi.string().valid('web', 'mobile').default('web'),
});

/**
 * POST /auth/refresh and POST /auth/logout share this body shape.
 * The refresh token is a 32-byte random value, base64url-encoded ⇒
 * 43 chars. We allow 32–256 to be defensive against future changes.
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().trim().min(32).max(256).required(),
});

module.exports = { loginSchema, refreshTokenSchema };

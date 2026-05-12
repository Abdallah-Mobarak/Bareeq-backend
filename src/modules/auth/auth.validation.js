const Joi = require('joi');

/**
 * POST /auth/web/login   and   POST /auth/mobile/login
 * Body: { identifier, password, deviceInfo? }
 *
 * `identifier` is either an email or a phone number; the service decides
 * which by checking for an `@`. We don't enforce a phone format here
 * because Saudi phone formats vary (+966, 05, etc.) and the FRD does not
 * pin a single shape down.
 *
 * `clientType` is NOT a body field — it's encoded in the URL itself
 * (/auth/web/* vs /auth/mobile/*) and passed by the controller to the
 * service. Putting it in the body would let any client lie about which
 * surface they are; the URL split makes the intent explicit and the
 * service's ROLE_CLIENT_MAP enforces the policy.
 */
const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(3).max(100).required(),
  password: Joi.string().min(6).max(100).required(),
  deviceInfo: Joi.string().max(255).optional().allow(null, ''),
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

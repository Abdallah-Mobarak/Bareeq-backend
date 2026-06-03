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

/**
 * PATCH /auth/me — self-service profile edit. Every field is optional but at
 * least one must be present (.min(1)). `preferredLanguage` drives the App
 * Settings → Arabic/English toggle on the mobile profile.
 */
const updateMeSchema = Joi.object({
  nameAr: Joi.string().trim().min(1).max(120),
  nameEn: Joi.string().trim().max(120).allow(null, ''),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(100),
  phone: Joi.string().trim().min(3).max(30).allow(null, ''),
  preferredLanguage: Joi.string().valid('AR', 'EN'),
}).min(1);

/** POST /auth/me/change-password — current + new password. */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(6).max(100).required(),
  newPassword: Joi.string().min(6).max(100).required(),
});

/** DELETE /auth/me — password confirmation guards the destructive action. */
const deleteAccountSchema = Joi.object({
  password: Joi.string().min(6).max(100).required(),
});

module.exports = {
  loginSchema,
  refreshTokenSchema,
  updateMeSchema,
  changePasswordSchema,
  deleteAccountSchema,
};

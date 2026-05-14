const Joi = require('joi');

/**
 * Customer self-service profile (FRD §1.1).
 *
 * Edits are PATCH — only the fields present in the body are touched.
 * Email is intentionally NOT editable here: changing it would require
 * re-running the email-OTP verification flow (we'll add that as a
 * dedicated /change-email endpoint when there's user demand).
 */

const nameArField = Joi.string().trim().min(2).max(100);
const nameEnField = Joi.string().trim().min(2).max(100).allow(null, '');
const phoneField = Joi.string().trim().min(8).max(25).allow(null, '');
const profilePictureField = Joi.string().trim().uri().max(1024).allow(null, '');
const passwordField = Joi.string().min(8).max(100);

const updateSchema = Joi.object({
  nameAr: nameArField.optional(),
  nameEn: nameEnField.optional(),
  phone: phoneField.optional(),
  profilePicture: profilePictureField.optional(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field is required to update' });

const changePasswordSchema = Joi.object({
  currentPassword: passwordField.required(),
  newPassword: passwordField.required(),
}).custom((value, helpers) => {
  if (value.currentPassword === value.newPassword) {
    return helpers.error('any.invalid', {
      message: 'New password must differ from current',
    });
  }
  return value;
}, 'password-mismatch-check');

module.exports = { updateSchema, changePasswordSchema };

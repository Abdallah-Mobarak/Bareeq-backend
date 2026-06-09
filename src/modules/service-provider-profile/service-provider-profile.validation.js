const Joi = require('joi');

/**
 * Service Provider self-service profile (FRD §2.1).
 *
 * Same shape as customer-profile.validation, with an extra `bio` field
 * the SP can update. Email change is intentionally excluded — re-doing
 * email-OTP verification needs its own flow.
 *
 * Note: KYC document upload is NOT exposed here. KYC submission lives
 * in a separate endpoint (Sprint 4) that handles file upload + sets
 * kycStatus = PENDING.
 */

const nameArField = Joi.string().trim().min(2).max(100);
const nameEnField = Joi.string().trim().min(2).max(100).allow(null, '');
const phoneField = Joi.string().trim().min(8).max(25).allow(null, '');
const profilePictureField = Joi.string().trim().uri().max(1024).allow(null, '');
const bioField = Joi.string().trim().max(2000).allow(null, '');
const passwordField = Joi.string().min(8).max(100);

const updateSchema = Joi.object({
  nameAr: nameArField.optional(),
  nameEn: nameEnField.optional(),
  phone: phoneField.optional(),
  profilePicture: profilePictureField.optional(),
  bio: bioField.optional(),
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

// "Delete account" (FRD §2.1 Profile). Password confirmation guards
// against accidental / hijacked-session deletion.
const deleteAccountSchema = Joi.object({
  password: passwordField.required(),
});

module.exports = { updateSchema, changePasswordSchema, deleteAccountSchema };

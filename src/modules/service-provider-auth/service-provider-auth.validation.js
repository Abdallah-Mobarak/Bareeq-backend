const Joi = require('joi');

/**
 * Service Provider signup — Marketplace §2.1.
 *
 * Same shape as customer-auth.validation. We deliberately keep these
 * separate files (not a shared base) so that if SP later needs extra
 * KYC fields at signup (FRD §2.1 hints at this), the change stays
 * local — no risk of accidentally touching the Customer flow.
 *
 * `bio` is the only SP-only field; it's optional at signup and can
 * also be set later via the profile-update endpoint.
 */

const emailField = Joi.string().trim().lowercase().email().max(255).required();
const passwordField = Joi.string().min(8).max(100).required();
const phoneField = Joi.string().trim().min(8).max(25).optional().allow(null, '');
const nameArField = Joi.string().trim().min(2).max(100).required();
const nameEnField = Joi.string().trim().min(2).max(100).optional().allow(null, '');
const bioField = Joi.string().trim().max(2000).optional().allow(null, '');
const otpField = Joi.string()
  .length(6)
  .pattern(/^\d{6}$/)
  .required();

const signupRequestSchema = Joi.object({
  email: emailField,
  password: passwordField,
  nameAr: nameArField,
  nameEn: nameEnField,
  phone: phoneField,
  bio: bioField,
});

const signupVerifySchema = Joi.object({
  email: emailField,
  password: passwordField,
  nameAr: nameArField,
  nameEn: nameEnField,
  phone: phoneField,
  bio: bioField,
  otp: otpField,
});

const passwordResetRequestSchema = Joi.object({
  email: emailField,
});

const passwordResetConfirmSchema = Joi.object({
  email: emailField,
  otp: otpField,
  newPassword: passwordField,
});

module.exports = {
  signupRequestSchema,
  signupVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
};

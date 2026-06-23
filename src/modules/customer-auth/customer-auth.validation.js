const Joi = require('joi');

/**
 * Customer signup — Marketplace §1.1.
 *
 * Flow: client posts the *full* signup payload twice — once to request
 * the OTP, again to verify it. We rely on the client to keep its form
 * state so the server doesn't need a `pending_signups` table.
 *
 * Why: a pending-signups table adds a second source of truth for user
 * identity, plus a cleanup job, plus a race-with-verify story. Having
 * the client re-send is one extra field on the wire and zero new state.
 */

const emailField = Joi.string().trim().lowercase().email().max(255).required();

const passwordField = Joi.string().min(8).max(100).required();

/**
 * Saudi phones come in several shapes (+966XXXXXXXXX, 05XXXXXXXX, etc.).
 * The FRD doesn't pin one — same rationale as the existing loginSchema:
 * leave format validation out of Joi and lean on the unique constraint
 * + admin lookup if anything ever clashes.
 */
const phoneField = Joi.string().trim().min(8).max(25).optional().allow(null, '');

const nameArField = Joi.string().trim().min(2).max(100).required();
const nameEnField = Joi.string().trim().min(2).max(100).optional().allow(null, '');

const otpField = Joi.string()
  .length(4)
  .pattern(/^\d{4}$/)
  .required();

const signupRequestSchema = Joi.object({
  email: emailField,
  password: passwordField,
  nameAr: nameArField,
  nameEn: nameEnField,
  phone: phoneField,
});

/**
 * Verify carries the same payload + the OTP. We re-validate everything
 * so the server never trusts intermediate state from the OTP-request
 * call. If a field changes between the two calls, the verify call wins.
 */
const signupVerifySchema = Joi.object({
  email: emailField,
  password: passwordField,
  nameAr: nameArField,
  nameEn: nameEnField,
  phone: phoneField,
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

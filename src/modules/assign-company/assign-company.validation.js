const Joi = require('joi');

const phoneSchema = Joi.string()
  .trim()
  .min(9)
  .max(20)
  .pattern(/^[+0-9\s-]+$/);

const emailSchema = Joi.string()
  .lowercase()
  .trim()
  .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
  .messages({ 'string.pattern.base': '"email" must be a valid email' });

const accountantManagerSchema = Joi.object({
  email: emailSchema.required(),
  phone: phoneSchema.required(),
  password: Joi.string().min(8).max(100).required(),
  nameAr: Joi.string().trim().min(2).max(150).required(),
  nameEn: Joi.string().trim().max(150).optional().allow(null, ''),
  assignedToAllBranches: Joi.boolean().default(false),
  regionSchedulingIds: Joi.array().items(Joi.string()).default([]),
});

/**
 * FR-35: company access details (Email + Password + Phone) — all three
 * required because this is the FIRST time this company gets a login.
 */
const loginDetailsSchema = Joi.object({
  email: emailSchema.required(),
  phone: phoneSchema.required(),
  password: Joi.string().min(8).max(100).required(),
});

/**
 * POST /assign-company — FRD §2.1.
 *
 * Selects a `companyName` from the dropdown (sourced from
 * region_schedulings.companyName). Behavior depends on company state:
 *
 *   - First call (no Company / no COMPANY_USER yet): `loginDetails` is
 *     REQUIRED. Service creates Company + COMPANY_USER + AMs.
 *
 *   - Subsequent calls (company already has login but still has
 *     unassigned branches): `loginDetails` is IGNORED. Service just
 *     adds the new AMs to the existing Company.
 *
 * The dropdown returns companies that need ANY assignment work — no
 * login OR has unassigned branches — so re-calling /assign-company for
 * the same company is the expected flow when adding more AMs.
 */
const assignCompanySchema = Joi.object({
  companyName: Joi.string().trim().min(1).max(200).required(),
  loginDetails: loginDetailsSchema.optional(),
  accountantManagers: Joi.array().items(accountantManagerSchema).default([]),
}).custom((value, helpers) => {
  if (
    !value.loginDetails &&
    (!value.accountantManagers || value.accountantManagers.length === 0)
  ) {
    return helpers.error('any.custom', {
      message: 'Provide either loginDetails (first time) or at least one accountantManager',
    });
  }
  return value;
}, 'at-least-one');

const availableCompaniesQuerySchema = Joi.object({
  q: Joi.string().trim().max(200).optional().allow(''),
});

const branchesQuerySchema = Joi.object({
  companyName: Joi.string().trim().min(1).max(200).required(),
  q: Joi.string().trim().max(200).optional().allow(''),
});

module.exports = {
  assignCompanySchema,
  availableCompaniesQuerySchema,
  branchesQuerySchema,
};

const Joi = require('joi');

/**
 * Customer bookings (FRD §1.3, §1.2.2.1 service request).
 *
 * On create the client posts the serviceId + the subcategoryIds they
 * picked (must all belong to that service). The server validates the
 * service is active, validates every subcategory is alive + belongs,
 * computes totalCost, and stores a snapshot per subcategory.
 *
 * paymentMethod is restricted to CASH on MVP. WALLET + ONLINE land
 * with the Sprint 4 payment integration; we keep the enum field so
 * future bookings can opt in without a schema change.
 */

const createSchema = Joi.object({
  serviceId: Joi.string().required(),
  subcategoryIds: Joi.array().items(Joi.string()).min(1).max(50).unique().required().messages({
    'array.min': 'At least one subcategory must be selected',
  }),
  description: Joi.string().trim().max(2000).optional().allow(null, ''),
  locationLat: Joi.number().min(-90).max(90).optional().allow(null),
  locationLng: Joi.number().min(-180).max(180).optional().allow(null),
  locationAddress: Joi.string().trim().max(500).optional().allow(null, ''),
  scheduledDate: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Scheduled date must be in the future',
  }),
  paymentMethod: Joi.string().valid('CASH', 'WALLET', 'ONLINE').required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED')
    .optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const cancelSchema = Joi.object({
  reason: Joi.string().trim().min(2).max(500).required().messages({
    'any.required': 'Cancellation reason is required',
  }),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = { createSchema, listQuerySchema, cancelSchema, idParamSchema };

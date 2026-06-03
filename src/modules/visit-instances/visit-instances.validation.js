const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const taskCheckParamSchema = Joi.object({
  id: Joi.string().required(),
  taskCheckId: Joi.string().required(),
});

/**
 * POST /visit-instances/:id/start (FRD §1.2.3.1 §2.2).
 * GPS pair is required — the supervisor's location at the moment of
 * "Start Visit" is logged. If the FE can't get GPS, the FE should
 * surface that error and not call this endpoint.
 */
const startSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const finalClosedSchema = Joi.object({}).default({});

const notImplementedSchema = Joi.object({
  notImplementedReasonId: Joi.string().required(),
  // Free-text "Additional Notes" (shown when the reason is "Other").
  note: Joi.string().trim().max(1000).optional().allow(null, ''),
});

const completeSchema = Joi.object({
  // Optional "Notes (optional)" the supervisor adds when completing the visit.
  note: Joi.string().trim().max(1000).optional().allow(null, ''),
}).default({});

const toggleTaskSchema = Joi.object({
  done: Joi.boolean().required(),
});

module.exports = {
  idParamSchema,
  taskCheckParamSchema,
  startSchema,
  finalClosedSchema,
  notImplementedSchema,
  completeSchema,
  toggleTaskSchema,
};

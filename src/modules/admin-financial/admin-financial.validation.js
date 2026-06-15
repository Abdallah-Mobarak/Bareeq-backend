const Joi = require('joi');

/**
 * Admin Financial dashboard — Marketplace §3.5.1 "View Reports".
 *
 * Optional date range narrows every metric to bookings completed within
 * [from, to]. Omit both for all-time totals (the default dashboard view).
 */
const summaryQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().min(Joi.ref('from')).optional(),
});

module.exports = { summaryQuerySchema };

const Joi = require('joi');

/**
 * One row in scheduledVisits[]. The admin only picks the branch and
 * (optionally) when its first visit lands. `numberOfVisits` is read
 * server-side from RegionScheduling — it's defined per branch, not
 * per schedule.
 */
const scheduledVisitInputSchema = Joi.object({
  regionSchedulingId: Joi.string().required(),
  firstVisitDate: Joi.date().iso().optional(),
});

/**
 * POST /monthly-schedules — "Assign Supervisor" form (FE screen).
 *
 * The admin:
 *   - Picks the supervisor.
 *   - Optionally picks one date that applies to every branch in the
 *     list (FE label: "Apply Visit Date to All").
 *   - For any branch that needs a different start, fills its own
 *     firstVisitDate.
 *
 * The combined rule: every scheduledVisit must end up with a date —
 * either via `applyToAllDate` (the global fallback) or its own
 * firstVisitDate. Custom check below enforces it.
 *
 * No year/month: the system derives them from the dates and validates
 * they all sit in the same calendar month.
 *
 * No `publish` flag: schedules are always created live (publishedAt =
 * now). If we ever want a draft mode again, we add it back here.
 */
const createScheduleSchema = Joi.object({
  supervisorId: Joi.string().required(),
  applyToAllDate: Joi.date().iso().optional(),
  scheduledVisits: Joi.array().items(scheduledVisitInputSchema).min(1).required(),
}).custom((value, helpers) => {
  const { applyToAllDate, scheduledVisits } = value;
  if (!applyToAllDate) {
    const missing = scheduledVisits.findIndex((sv) => !sv.firstVisitDate);
    if (missing !== -1) {
      return helpers.error('any.custom', {
        message: `scheduledVisits[${missing}].firstVisitDate is required when applyToAllDate is not set`,
      });
    }
  }
  return value;
}, 'date-coverage');

const listSchedulesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  supervisorId: Joi.string().optional().allow(''),
  year: Joi.number().integer().min(2024).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createScheduleSchema,
  listSchedulesQuerySchema,
  idParamSchema,
};

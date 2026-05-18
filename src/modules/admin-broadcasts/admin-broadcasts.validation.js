const Joi = require('joi');

/**
 * Admin Broadcast Notifications — FRD §4.14 / §3.6 marketplace.
 *
 * Audience is a tagged-union (discriminated by `kind`) rather than three
 * mutually-exclusive top-level fields. Keeps the payload self-describing
 * and the validation rules tight (you can't accidentally pass `roles`
 * with `kind: USERS`).
 */

const SYSTEM_ROLES = [
  'ADMIN',
  'MANAGER',
  'SUPERVISOR',
  'COMPANY_USER',
  'ACCOUNTANT_MANAGER',
  'CUSTOMER',
  'SERVICE_PROVIDER',
];

const audienceSchema = Joi.alternatives()
  .try(
    Joi.object({
      kind: Joi.string().valid('ALL').required(),
    }),
    Joi.object({
      kind: Joi.string().valid('ROLES').required(),
      /**
       * At least one role; up to all seven. The admin can target a single
       * audience ("CUSTOMER") or a mix ("CUSTOMER + SERVICE_PROVIDER").
       */
      roles: Joi.array()
        .items(Joi.string().valid(...SYSTEM_ROLES))
        .min(1)
        .max(SYSTEM_ROLES.length)
        .unique()
        .required(),
    }),
    Joi.object({
      kind: Joi.string().valid('USERS').required(),
      /**
       * Up to 1000 user ids per send. If you need more, send in batches
       * or use kind=ROLES. The hard cap protects against accidentally
       * massive POST bodies.
       */
      userIds: Joi.array().items(Joi.string().trim().min(1).max(40)).min(1).max(1000).required(),
    }),
  )
  .required();

const sendBroadcastSchema = Joi.object({
  titleAr: Joi.string().trim().min(1).max(200).required(),
  titleEn: Joi.string().trim().max(200).optional().allow(null, ''),
  bodyAr: Joi.string().trim().min(1).max(2000).required(),
  bodyEn: Joi.string().trim().max(2000).optional().allow(null, ''),
  audience: audienceSchema,
});

const listBroadcastsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(200).optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

module.exports = {
  sendBroadcastSchema,
  listBroadcastsQuerySchema,
  idParamSchema,
};

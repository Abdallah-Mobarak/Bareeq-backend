const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(40).required(),
});

const listMessagesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),

  status: Joi.string().valid('PENDING', 'REPLIED').optional(),
  email: Joi.string().trim().max(150).optional(),
  /**
   * Filter by sender role. Useful when admins want to focus on
   * messages from a specific user type (e.g. only Companies).
   */
  userRole: Joi.string().valid('COMPANY_USER', 'ACCOUNTANT_MANAGER').optional(),
});

const replyBodySchema = Joi.object({
  reply: Joi.string().trim().min(2).max(5000).required(),
});

module.exports = { idParamSchema, listMessagesQuerySchema, replyBodySchema };

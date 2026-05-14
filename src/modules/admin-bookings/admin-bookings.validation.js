const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED')
    .optional(),
  serviceId: Joi.string().optional(),
  customerId: Joi.string().optional(),
  assignedSpId: Joi.string().optional(),
  paymentMethod: Joi.string().valid('CASH', 'WALLET', 'ONLINE').optional(),
  paymentStatus: Joi.string().valid('PENDING', 'PAID', 'REFUNDED').optional(),
  sort: Joi.string().valid('newest', 'oldest').default('newest'),
});

module.exports = { idParamSchema, listQuerySchema };

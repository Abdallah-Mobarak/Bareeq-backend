const Joi = require('joi');

/**
 * One required-task line. visitType: 1=V1, 2=V2, 3=V3, 4=V4.
 * sortOrder controls display order within a visit type.
 */
const requiredTaskSchema = Joi.object({
  visitType: Joi.number().integer().min(1).max(4).required(),
  titleAr: Joi.string().trim().min(1).max(255).required(),
  titleEn: Joi.string().trim().max(255).optional().allow(null, ''),
  sortOrder: Joi.number().integer().min(0).default(0),
});

const createBranchSchema = Joi.object({
  companyId: Joi.string().required(),
  categoryId: Joi.string().optional().allow(null, ''),
  regionId: Joi.string().required(),
  cityId: Joi.string().required(),

  nameAr: Joi.string().trim().min(2).max(200).required(),
  nameEn: Joi.string().trim().max(200).optional().allow(null, ''),
  branchNumber: Joi.string().trim().max(50).optional().allow(null, ''),
  code: Joi.string().trim().max(50).optional().allow(null, ''),
  addressAr: Joi.string().trim().max(500).optional().allow(null, ''),
  addressEn: Joi.string().trim().max(500).optional().allow(null, ''),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),

  visitsPerMonth: Joi.number().integer().min(1).max(4).default(1),

  /// All required tasks for all visit types in one shot.
  requiredTasks: Joi.array().items(requiredTaskSchema).default([]),
});

const updateBranchSchema = Joi.object({
  companyId: Joi.string().optional(),
  categoryId: Joi.string().optional().allow(null, ''),
  regionId: Joi.string().optional(),
  cityId: Joi.string().optional(),

  nameAr: Joi.string().trim().min(2).max(200).optional(),
  nameEn: Joi.string().trim().max(200).optional().allow(null, ''),
  branchNumber: Joi.string().trim().max(50).optional().allow(null, ''),
  code: Joi.string().trim().max(50).optional().allow(null, ''),
  addressAr: Joi.string().trim().max(500).optional().allow(null, ''),
  addressEn: Joi.string().trim().max(500).optional().allow(null, ''),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),

  visitsPerMonth: Joi.number().integer().min(1).max(4).optional(),

  /// Optional. If provided, the existing tasks are REPLACED with this list.
  /// Pass [] to clear all tasks; omit to leave them unchanged.
  requiredTasks: Joi.array().items(requiredTaskSchema).optional(),
}).min(1);

const listBranchesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().max(100).optional().allow(''),
  companyId: Joi.string().optional().allow(''),
  regionId: Joi.string().optional().allow(''),
  cityId: Joi.string().optional().allow(''),
  categoryId: Joi.string().optional().allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'name').default('newest'),
});

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
  idParamSchema,
};

const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./monthly-schedules.service');

const create = asyncHandler(async (req, res) => {
  const schedule = await service.createSchedule(req.body);
  res.status(201).json({ success: true, data: { schedule } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listSchedules(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const schedule = await service.getSchedule(req.params.id);
  res.json({ success: true, data: { schedule } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteSchedule(req.params.id);
  res.json({ success: true, data: { message: 'Monthly schedule deleted' } });
});

module.exports = { create, list, getOne, remove };

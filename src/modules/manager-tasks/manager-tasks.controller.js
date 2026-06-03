const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./manager-tasks.service');

// Admin-side
const create = asyncHandler(async (req, res) => {
  const task = await service.createTask(req.body);
  res.status(201).json({ success: true, data: { task } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listTasks(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const task = await service.getTask(req.params.id);
  res.json({ success: true, data: { task } });
});

const update = asyncHandler(async (req, res) => {
  const task = await service.updateTask(req.params.id, req.body);
  res.json({ success: true, data: { task } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteTask(req.params.id);
  res.json({ success: true, data: { message: 'Task deleted' } });
});

// Manager-side
const listMine = asyncHandler(async (req, res) => {
  const result = await service.listMyTasks(req.user.id, req.validatedQuery);
  res.json({ success: true, data: result });
});

const setMineStatus = asyncHandler(async (req, res) => {
  const task = await service.setMyTaskStatus(req.user.id, req.params.id, req.body.done);
  res.json({ success: true, data: { task } });
});

/**
 * PATCH /manager-tasks/:id/status — actors with MANAGE_TASKS can flip
 * any task's done flag, not just their own.
 */
const setStatus = asyncHandler(async (req, res) => {
  const task = await service.setTaskStatus(req.params.id, req.body.done);
  res.json({ success: true, data: { task } });
});

module.exports = { create, list, getOne, update, remove, listMine, setMineStatus, setStatus };

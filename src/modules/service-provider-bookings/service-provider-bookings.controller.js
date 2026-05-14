const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./service-provider-bookings.service');

const listPool = asyncHandler(async (req, res) => {
  const result = await service.listPool(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

const accept = asyncHandler(async (req, res) => {
  const result = await service.acceptBooking(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

const listMine = asyncHandler(async (req, res) => {
  const result = await service.listMine(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getOne(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

const start = asyncHandler(async (req, res) => {
  const result = await service.startBooking(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

const complete = asyncHandler(async (req, res) => {
  const result = await service.completeBooking(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

module.exports = { listPool, accept, listMine, getOne, start, complete };

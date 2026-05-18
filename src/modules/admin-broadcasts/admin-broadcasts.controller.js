const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-broadcasts.service');

const send = asyncHandler(async (req, res) => {
  const broadcast = await service.sendBroadcast({
    adminId: req.user.id,
    ...req.body,
  });
  res.status(201).json({ success: true, data: { broadcast } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listBroadcasts(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const broadcast = await service.getBroadcast(req.params.id);
  res.json({ success: true, data: { broadcast } });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteBroadcast(req.params.id);
  res.json({ success: true, data: { message: 'Broadcast deleted' } });
});

module.exports = { send, list, getOne, remove };

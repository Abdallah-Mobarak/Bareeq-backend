const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./notifications.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listMine(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

const unreadCount = asyncHandler(async (req, res) => {
  const result = await service.getUnreadCount(req.user.id);
  res.json({ success: true, data: result });
});

const markRead = asyncHandler(async (req, res) => {
  const result = await service.markRead(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await service.markAllRead(req.user.id);
  res.json({ success: true, data: result });
});

module.exports = { list, unreadCount, markRead, markAllRead };

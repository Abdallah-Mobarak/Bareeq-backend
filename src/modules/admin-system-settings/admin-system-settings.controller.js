const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-system-settings.service');

const list = asyncHandler(async (req, res) => {
  const settings = await service.listAll();
  res.json({ success: true, data: { settings } });
});

const getOne = asyncHandler(async (req, res) => {
  const setting = await service.getOne(req.params.key);
  res.json({ success: true, data: { setting } });
});

const upsert = asyncHandler(async (req, res) => {
  const setting = await service.upsert(req.params.key, req.body.value);
  res.json({ success: true, data: { setting } });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.key);
  res.json({ success: true, data: { message: 'Setting deleted' } });
});

module.exports = { list, getOne, upsert, remove };

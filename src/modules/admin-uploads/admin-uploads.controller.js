const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-uploads.service');

const upload = asyncHandler(async (req, res) => {
  const result = await service.uploadImage(req.file);
  res.status(201).json({ success: true, data: result });
});

module.exports = { upload };

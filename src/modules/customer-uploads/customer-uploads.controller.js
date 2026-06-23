const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-uploads.service');

const upload = asyncHandler(async (req, res) => {
  const result = await service.uploadPhotos(req.files);
  res.status(201).json({ success: true, ...result });
});

module.exports = { upload };

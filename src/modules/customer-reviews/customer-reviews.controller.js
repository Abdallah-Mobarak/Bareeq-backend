const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-reviews.service');

const submit = asyncHandler(async (req, res) => {
  const result = await service.submitReview(req.user.id, req.params.id, req.body);
  res.status(201).json({ success: true, data: result });
});

const getMine = asyncHandler(async (req, res) => {
  const result = await service.getMyReview(req.user.id, req.params.id);
  res.json({ success: true, data: result });
});

module.exports = { submit, getMine };

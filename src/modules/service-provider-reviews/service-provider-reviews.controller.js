const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./service-provider-reviews.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listMyReviews(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

module.exports = { list };

const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./locations.service');

const listRegions = asyncHandler(async (req, res) => {
  const result = await service.listRegions();
  res.json({ success: true, data: result });
});

const listCities = asyncHandler(async (req, res) => {
  // ?regionId=... narrows the list to one region's cities (used by the
  // City dropdown once a Region is picked). Read straight off the query —
  // it's an optional, non-sensitive filter.
  const result = await service.listCities({ regionId: req.query.regionId });
  res.json({ success: true, data: result });
});

module.exports = { listRegions, listCities };

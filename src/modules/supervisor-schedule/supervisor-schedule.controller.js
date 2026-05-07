const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./supervisor-schedule.service');

const summary = asyncHandler(async (req, res) => {
  const data = await service.myScheduleSummary(req.user.id, req.validatedQuery || {});
  res.json({ success: true, data });
});

const listBranches = asyncHandler(async (req, res) => {
  const data = await service.listMyBranches(req.user.id, req.validatedQuery);
  res.json({ success: true, data });
});

const branchDetail = asyncHandler(async (req, res) => {
  const data = await service.getMyBranchDetail(req.user.id, req.params.id);
  res.json({ success: true, data });
});

module.exports = { summary, listBranches, branchDetail };

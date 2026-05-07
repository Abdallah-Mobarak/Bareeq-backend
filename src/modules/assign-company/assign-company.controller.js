const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./assign-company.service');

const assign = asyncHandler(async (req, res) => {
  const result = await service.assignCompany(req.body);
  res.status(201).json({ success: true, data: result });
});

const availableCompanies = asyncHandler(async (req, res) => {
  const data = await service.listAvailableCompanies(req.query);
  res.json({ success: true, data });
});

const branches = asyncHandler(async (req, res) => {
  const data = await service.listCompanyBranches(req.query);
  res.json({ success: true, data });
});

module.exports = { assign, availableCompanies, branches };

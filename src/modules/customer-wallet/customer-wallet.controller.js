const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customer-wallet.service');

const getWallet = asyncHandler(async (req, res) => {
  const result = await service.getWallet(req.user.id);
  res.json({ success: true, data: result });
});

const listTransactions = asyncHandler(async (req, res) => {
  const result = await service.listTransactions(req.user.id, req.validatedQuery);
  res.json({ success: true, ...result });
});

const createTopup = asyncHandler(async (req, res) => {
  const result = await service.createTopup(req.user.id, req.body);
  res.json({ success: true, data: result });
});

module.exports = { getWallet, listTransactions, createTopup };

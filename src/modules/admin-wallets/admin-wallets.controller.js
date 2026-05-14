const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin-wallets.service');

const topup = asyncHandler(async (req, res) => {
  const result = await service.topup(req.user.id, req.params.userId, req.body);
  res.status(201).json({ success: true, data: result });
});

const adjustment = asyncHandler(async (req, res) => {
  const result = await service.adjustment(req.user.id, req.params.userId, req.body);
  res.status(201).json({ success: true, data: result });
});

const getWallet = asyncHandler(async (req, res) => {
  const result = await service.getWallet(req.params.userId);
  res.json({ success: true, data: result });
});

const listTransactions = asyncHandler(async (req, res) => {
  const result = await service.listTransactions(req.params.userId, req.validatedQuery);
  res.json({ success: true, ...result });
});

module.exports = { topup, adjustment, getWallet, listTransactions };

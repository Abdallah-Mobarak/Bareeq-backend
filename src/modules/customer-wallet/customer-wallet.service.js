const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { serializeTxn } = require('../../services/wallet.service');

/**
 * Customer self-service wallet view — FRD §1.1 "Wallet Balance Setup".
 *
 * Read-only from the customer side. Top-ups happen via /admin/wallets
 * (manual MVP) or PayTabs in Sprint 4+. The customer never directly
 * mutates their own balance — it's always a system-driven event.
 */

const getWallet = async (userId) => {
  const customer = await prisma.customer.findFirst({
    where: { userId, deletedAt: null },
  });
  if (!customer) {
    throw ApiError.notFound('Customer wallet not found');
  }
  return {
    userId,
    balance: Number(customer.walletBalance).toFixed(2),
    currency: 'SAR',
  };
};

const listTransactions = async (userId, { page, limit, type }) => {
  const skip = (page - 1) * limit;
  const where = {
    userId,
    ...(type && { type }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.walletTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    items: items.map(serializeTxn),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = { getWallet, listTransactions };

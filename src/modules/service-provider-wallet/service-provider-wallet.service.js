const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { serializeTxn } = require('../../services/wallet.service');

/**
 * Service Provider wallet view — FRD §2.1 "Wallet Balance Setup".
 *
 * Read-only. Inflows come from completed bookings (BOOKING_CREDIT) and
 * admin top-ups; outflows from commissions (COMMISSION_DEBIT) and
 * withdrawals (Sprint 4+). Total earned and total commission are
 * computed up front so the SP profile dashboard can render a summary
 * card without paging the whole ledger.
 */

const getWallet = async (userId) => {
  const sp = await prisma.serviceProvider.findFirst({
    where: { userId, deletedAt: null },
  });
  if (!sp) {
    throw ApiError.notFound('Service provider wallet not found');
  }

  // Lifetime aggregates by type — drives the SP dashboard summary.
  const grouped = await prisma.walletTransaction.groupBy({
    by: ['type'],
    where: { userId },
    _sum: { amount: true },
  });

  const totals = grouped.reduce((acc, g) => {
    acc[g.type] = Number(g._sum.amount || 0);
    return acc;
  }, {});

  return {
    userId,
    balance: Number(sp.walletBalance).toFixed(2),
    currency: 'SAR',
    totalEarned: (totals.BOOKING_CREDIT || 0).toFixed(2),
    totalCommissions: (totals.COMMISSION_DEBIT || 0).toFixed(2),
    totalWithdrawn: (totals.WITHDRAWAL || 0).toFixed(2),
  };
};

const listTransactions = async (userId, { page, limit, type }) => {
  const skip = (page - 1) * limit;
  const where = { userId, ...(type && { type }) };

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

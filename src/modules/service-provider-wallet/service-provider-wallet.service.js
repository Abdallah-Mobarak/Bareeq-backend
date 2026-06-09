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

/**
 * GET /service-provider/wallet/commissions — the "Commission" tab.
 *
 * Each COMMISSION_DEBIT ledger row is joined back to its booking so the
 * UI can render "−25 SAR · of 250 SAR · 10% commission" per row, plus the
 * header "Available balance … From N completed requests". The booking
 * carries the base (totalCost) and the locked rate (commissionRate), so
 * no extra columns are needed on the transaction itself.
 */
const listCommissions = async (userId, { page, limit }) => {
  const sp = await prisma.serviceProvider.findFirst({
    where: { userId, deletedAt: null },
  });
  if (!sp) {
    throw ApiError.notFound('Service provider wallet not found');
  }

  const skip = (page - 1) * limit;
  const where = { userId, type: 'COMMISSION_DEBIT' };

  const [rows, total, completedRequestsCount] = await prisma.$transaction([
    prisma.walletTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            totalCost: true,
            commissionRate: true,
            service: { select: { titleAr: true, titleEn: true } },
          },
        },
      },
    }),
    prisma.walletTransaction.count({ where }),
    prisma.booking.count({ where: { assignedSpId: userId, status: 'COMPLETED' } }),
  ]);

  const items = rows.map((t) => ({
    id: t.id,
    bookingId: t.bookingId,
    serviceNameAr: t.booking?.service?.titleAr || null,
    serviceNameEn: t.booking?.service?.titleEn || null,
    amount: Number(t.amount).toFixed(2), // the commission taken
    baseAmount: t.booking ? Number(t.booking.totalCost).toFixed(2) : null, // "of 250 SAR"
    commissionPercent: t.booking?.commissionRate ? t.booking.commissionRate.toString() : null,
    date: t.createdAt,
  }));

  return {
    availableBalance: Number(sp.walletBalance).toFixed(2),
    currency: 'SAR',
    completedRequestsCount,
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = { getWallet, listTransactions, listCommissions };

const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Marketplace §3.5.1 "View Reports" — the three dashboard cards.
 *
 * Definitions (from the FRD):
 *   - Total Payments        = total received from all COMPLETED services.
 *   - Commissions Collected = total commission taken from providers.
 *   - Net Platform Profit   = profit after deducting applicable costs.
 *
 * Both figures are summed over bookings in status COMPLETED — that is the
 * point at which the service is delivered and the commission is realised
 * (commissionAmount is locked at APPROVED and never reset afterwards).
 *
 * ASSUMPTION on Net Platform Profit: there is no operating-cost ledger in
 * the system yet, so the platform's profit equals the commission it
 * collects. When a cost model is added, subtract it here.
 */
const money = (decimalOrNull) =>
  decimalOrNull === null || decimalOrNull === undefined ? '0.00' : decimalOrNull.toFixed(2);

const getSummary = async ({ from, to } = {}) => {
  const where = { status: 'COMPLETED' };
  if (from || to) {
    where.createdAt = {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    };
  }

  const agg = await prisma.booking.aggregate({
    where,
    _sum: { totalCost: true, commissionAmount: true },
  });

  const commissionsCollected = agg._sum.commissionAmount;

  return {
    totalPayments: money(agg._sum.totalCost),
    commissionsCollected: money(commissionsCollected),
    // No cost ledger yet → net profit == commissions collected.
    netProfit: money(commissionsCollected),
    currency: 'SAR',
  };
};

module.exports = { getSummary };

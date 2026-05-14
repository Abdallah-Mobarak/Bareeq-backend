const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const walletService = require('../../services/wallet.service');
const { notify } = require('../notifications/notifications.service');

/**
 * Admin wallet operations — FRD §3.5 (admin financial management).
 *
 * Three actions:
 *   1. topup        — add money to a customer's wallet (manual MVP;
 *                     PayTabs will hit the same code path later via
 *                     externalRef).
 *   2. adjustment   — manual debit or credit. `note` is required —
 *                     this is the audit-trail value, since admin
 *                     adjustments are normally dispute resolutions.
 *   3. getWallet    — admin can read ANY user's wallet + ledger.
 *
 * Everything funnels through walletService.applyTransaction so the
 * balance + ledger row move atomically and all invariants (positive
 * amount, customer-can't-go-negative) are enforced in one place.
 */

const requireWalletUser = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { customer: true, serviceProvider: true },
  });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  const hasCustomer = user.customer && !user.customer.deletedAt;
  const hasSp = user.serviceProvider && !user.serviceProvider.deletedAt;
  if (!hasCustomer && !hasSp) {
    throw ApiError.badRequest('This user does not have a wallet');
  }
  return { user, kind: hasCustomer ? 'CUSTOMER' : 'SERVICE_PROVIDER' };
};

const topup = async (adminId, userId, { amount, note, externalRef }) => {
  const { kind } = await requireWalletUser(userId);

  // Admin top-up only credits CUSTOMER wallets. SP earnings come from
  // booking completions, not manual top-ups. If admin needs to push
  // money to an SP, use /adjustment with CREDIT direction — same
  // result, but the audit trail captures "admin moved money" intent.
  if (kind !== 'CUSTOMER') {
    throw ApiError.badRequest(
      'Top-up is for CUSTOMER wallets only. For SP credits, use /adjustment with direction=CREDIT.',
    );
  }

  const { newBalance } = await walletService.applyStandalone({
    userId,
    type: 'TOPUP',
    amount,
    externalRef: externalRef || null,
    note: note || `Manual top-up by admin ${adminId.slice(0, 8)}`,
  });

  logger.info({ adminId, userId, amount, newBalance }, 'Admin manually topped up wallet');

  // Tell the customer their wallet was funded.
  await notify({
    userId,
    type: 'TOPUP_RECEIVED',
    titleAr: 'تم شحن محفظتك',
    titleEn: 'Wallet topped up',
    bodyAr: `تم إضافة ${Number(amount).toFixed(2)} ر.س لمحفظتك. الرصيد الجديد: ${newBalance.toFixed(2)} ر.س.`,
    bodyEn: `${Number(amount).toFixed(2)} SAR was added to your wallet. New balance: ${newBalance.toFixed(2)} SAR.`,
    data: { amount: Number(amount).toFixed(2), newBalance: newBalance.toFixed(2) },
  });

  return {
    userId,
    amount: Number(amount).toFixed(2),
    newBalance: newBalance.toFixed(2),
  };
};

const adjustment = async (adminId, userId, { direction, amount, note }) => {
  await requireWalletUser(userId);

  const type = direction === 'CREDIT' ? 'ADJUSTMENT_CREDIT' : 'ADJUSTMENT_DEBIT';

  const { newBalance } = await walletService.applyStandalone({
    userId,
    type,
    amount,
    note: `Admin adjustment by ${adminId.slice(0, 8)}: ${note}`,
  });

  logger.info({ adminId, userId, direction, amount, note, newBalance }, 'Admin wallet adjustment');

  return {
    userId,
    direction,
    amount: Number(amount).toFixed(2),
    newBalance: newBalance.toFixed(2),
  };
};

const getWallet = async (userId) => {
  const { kind } = await requireWalletUser(userId);

  const balance =
    kind === 'CUSTOMER'
      ? (await prisma.customer.findFirst({ where: { userId, deletedAt: null } })).walletBalance
      : (await prisma.serviceProvider.findFirst({ where: { userId, deletedAt: null } }))
          .walletBalance;

  return {
    userId,
    kind,
    balance: Number(balance).toFixed(2),
    currency: 'SAR',
  };
};

const listTransactions = async (userId, { page, limit, type }) => {
  await requireWalletUser(userId);

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
    items: items.map(walletService.serializeTxn),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = { topup, adjustment, getWallet, listTransactions };

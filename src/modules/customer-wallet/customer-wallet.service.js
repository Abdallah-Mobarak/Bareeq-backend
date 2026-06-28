const crypto = require('node:crypto');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { config } = require('../../config/env');
const { logger } = require('../../utils/logger');
const { serializeTxn, applyTransaction } = require('../../services/wallet.service');
const paytabs = require('../../services/paytabs.service');

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

/**
 * POST /customer/wallet/topup — start a PayTabs hosted-payment session.
 *
 * Creates a PENDING WalletTopup, asks PayTabs for a payment page, stores the
 * tran_ref + paymentUrl, and returns the paymentUrl for the app to open. The
 * wallet is NOT credited here — that happens only on the verified callback.
 */
const createTopup = async (userId, { amount }) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER', deletedAt: null },
  });
  if (!user) {
    throw ApiError.notFound('Customer not found');
  }

  const cartId = `TOPUP-${crypto.randomUUID()}`;
  const topup = await prisma.walletTopup.create({
    data: { customerId: userId, amount: Number(amount).toFixed(2), currency: 'SAR', cartId },
  });

  // TEST MODE (no PayTabs account yet): credit the wallet immediately and
  // return without a paymentUrl. Lets the app's "Add balance" be tested end-
  // to-end until a real PayTabs merchant account is available.
  if (config.walletTopupTestMode) {
    await prisma.$transaction(async (tx) => {
      await tx.walletTopup.update({ where: { id: topup.id }, data: { status: 'COMPLETED' } });
      await applyTransaction(tx, {
        userId,
        type: 'TOPUP',
        amount: Number(amount),
        externalRef: cartId,
        note: 'Wallet top-up (TEST MODE — no payment gateway)',
      });
    });
    logger.warn(
      { userId, amount: Number(amount), cartId },
      'WALLET_TOPUP_TEST_MODE credited wallet directly — disable before launch',
    );
    const wallet = await getWallet(userId);
    return {
      paymentUrl: null,
      topupId: topup.id,
      status: 'COMPLETED',
      testMode: true,
      balance: wallet.balance,
    };
  }

  const apiBase = `${config.publicBaseUrl}${config.apiPrefix}`;

  try {
    const { tranRef, paymentUrl } = await paytabs.createHostedPayment({
      cartId,
      amount,
      description: 'Bareeq wallet top-up',
      customer: {
        name: user.nameEn || user.nameAr || 'Customer',
        email: user.email,
        phone: user.phone || undefined,
        country: 'SA',
      },
      callbackUrl: `${apiBase}/payments/paytabs/callback`,
      returnUrl: `${apiBase}/payments/paytabs/return`,
    });

    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: { tranRef, paymentUrl },
    });

    return { paymentUrl, topupId: topup.id, tranRef };
  } catch (err) {
    // Mark the attempt failed so it isn't left dangling as PENDING.
    await prisma.walletTopup
      .update({ where: { id: topup.id }, data: { status: 'FAILED' } })
      .catch(() => {});
    throw err;
  }
};

module.exports = { getWallet, listTransactions, createTopup };

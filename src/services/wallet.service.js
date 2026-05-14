const { prisma } = require('../infrastructure/database/prisma');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../utils/logger');

/**
 * Wallet helper — the ONLY place that mutates a user's wallet balance.
 *
 * Why centralise:
 *   - Atomicity is non-negotiable. Every balance change is paired with
 *     a ledger row in the same Prisma transaction. Multiple consumers
 *     (admin top-up, booking debit, refund, completion credit,
 *     withdrawal) must all use this so the invariants hold.
 *
 * Invariants enforced here:
 *   1. amount stored in WalletTransaction is always > 0; the sign is
 *      derived from `type`.
 *   2. balanceAfter row = previous balance + signed amount.
 *   3. CUSTOMER wallets cannot go negative — insufficient funds throws
 *      a clean 400 BEFORE any row is written.
 *   4. SP wallets MAY go briefly negative on COMMISSION_DEBIT (we let
 *      the platform pull commission before the SP tops up). Admin
 *      reconciles via ADJUSTMENT or withdrawal flow.
 *
 * applyTransaction is designed to be called INSIDE an outer Prisma
 * transaction (the caller passes `tx`). That way the wallet change
 * commits or rolls back with the rest of the business operation.
 */

const SIGN_MAP = {
  TOPUP: +1,
  REFUND: +1,
  BOOKING_CREDIT: +1,
  ADJUSTMENT_CREDIT: +1,

  BOOKING_DEBIT: -1,
  COMMISSION_DEBIT: -1,
  WITHDRAWAL: -1,
  ADJUSTMENT_DEBIT: -1,
};

/**
 * Read the satellite that holds the balance. Customer + ServiceProvider
 * both carry `walletBalance`; supervisors / admins / etc. have no
 * wallet (those roles use the platform without one).
 *
 * Returns { kind: 'CUSTOMER'|'SERVICE_PROVIDER', balance: Number }
 * or throws 400 if the user has no wallet.
 */
const getWalletOwner = async (tx, userId) => {
  const user = await tx.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { customer: true, serviceProvider: true },
  });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (user.customer && !user.customer.deletedAt) {
    return { kind: 'CUSTOMER', balance: Number(user.customer.walletBalance) };
  }
  if (user.serviceProvider && !user.serviceProvider.deletedAt) {
    return {
      kind: 'SERVICE_PROVIDER',
      balance: Number(user.serviceProvider.walletBalance),
    };
  }
  throw ApiError.badRequest('This user does not have a wallet');
};

/**
 * Apply a wallet transaction atomically. MUST be called inside the
 * caller's $transaction — `tx` is the Prisma transactional client.
 *
 * @param {object} tx       Prisma transactional client
 * @param {object} input    { userId, type, amount, bookingId?, externalRef?, note? }
 * @returns {Promise<{ txn, newBalance, kind }>}
 */
const applyTransaction = async (tx, { userId, type, amount, bookingId, externalRef, note }) => {
  const sign = SIGN_MAP[type];
  if (sign === undefined) {
    throw ApiError.internal(`Unknown WalletTransactionType: ${type}`);
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw ApiError.badRequest('Amount must be a positive number');
  }

  const { kind, balance: currentBalance } = await getWalletOwner(tx, userId);
  const newBalance = currentBalance + sign * numericAmount;

  // Customer wallet cannot go negative — block insufficient-funds before
  // any row is written.
  if (kind === 'CUSTOMER' && newBalance < 0) {
    throw ApiError.badRequest(
      `Insufficient wallet balance — current: ${currentBalance.toFixed(2)}, required: ${numericAmount.toFixed(2)}`,
    );
  }

  const balanceAfterStr = newBalance.toFixed(2);

  // Update the satellite's denormalised balance + insert the ledger row.
  if (kind === 'CUSTOMER') {
    await tx.customer.update({
      where: { userId },
      data: { walletBalance: balanceAfterStr },
    });
  } else {
    await tx.serviceProvider.update({
      where: { userId },
      data: { walletBalance: balanceAfterStr },
    });
  }

  const txn = await tx.walletTransaction.create({
    data: {
      userId,
      type,
      amount: numericAmount.toFixed(2),
      balanceAfter: balanceAfterStr,
      bookingId: bookingId || null,
      externalRef: externalRef || null,
      note: note || null,
    },
  });

  logger.info(
    { userId, type, amount: numericAmount, balanceAfter: balanceAfterStr, bookingId },
    'Wallet transaction applied',
  );

  return { txn, newBalance, kind };
};

/**
 * Convenience wrapper for callers that aren't already inside a
 * transaction (admin top-up, standalone adjustments). Opens its own
 * $transaction so the balance + ledger move atomically.
 */
const applyStandalone = async (input) =>
  prisma.$transaction(async (tx) => applyTransaction(tx, input));

const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const serializeTxn = (t) => ({
  id: t.id,
  type: t.type,
  amount: money(t.amount),
  balanceAfter: money(t.balanceAfter),
  bookingId: t.bookingId,
  externalRef: t.externalRef,
  note: t.note,
  createdAt: t.createdAt,
});

module.exports = { applyTransaction, applyStandalone, getWalletOwner, serializeTxn };

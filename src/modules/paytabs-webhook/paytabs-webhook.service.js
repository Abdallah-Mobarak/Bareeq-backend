const { prisma } = require('../../infrastructure/database/prisma');
const { logger } = require('../../utils/logger');
const walletService = require('../../services/wallet.service');
const paytabs = require('../../services/paytabs.service');
const { notify } = require('../notifications/notifications.service');

/**
 * Apply a (signature-verified) PayTabs callback to a WalletTopup.
 *
 * Idempotent + atomic:
 *   - Looks the top-up up by cart_id; ignores unknown/duplicate callbacks.
 *   - Only the call that flips PENDING -> COMPLETED inside the transaction
 *     credits the wallet, so a replayed callback can never double-credit.
 *   - The credited amount is read from OUR stored record, never from the
 *     callback payload (which an attacker could tamper with).
 *
 * Always resolves (never throws) so the webhook can return 200 to PayTabs.
 */
const completeTopupFromCallback = async (payload) => {
  const cartId = payload.cart_id;
  const tranRef = payload.tran_ref || null;
  const responseStatus = payload?.payment_result?.response_status || payload.resp_status || null;

  if (!cartId) {
    logger.warn('PayTabs callback missing cart_id — ignored');
    return;
  }

  const topup = await prisma.walletTopup.findUnique({ where: { cartId } });
  if (!topup) {
    logger.warn({ cartId }, 'PayTabs callback for unknown top-up — ignored');
    return;
  }
  if (topup.status === 'COMPLETED') {
    logger.info({ cartId }, 'PayTabs callback duplicate — already credited');
    return;
  }

  // "A" = Authorised/approved.
  let success = responseStatus === 'A';

  // Defence-in-depth: confirm with PayTabs directly. A definitive non-"A"
  // overrides; an unreachable query falls back to the signed callback.
  if (success && tranRef) {
    const q = await paytabs.queryTransaction(tranRef);
    const qStatus = q?.payment_result?.response_status;
    if (qStatus && qStatus !== 'A') {
      success = false;
      logger.warn(
        { cartId, tranRef, qStatus },
        'PayTabs query contradicts callback — treating as failed',
      );
    }
  }

  if (!success) {
    await prisma.walletTopup.updateMany({
      where: { id: topup.id, status: 'PENDING' },
      data: { status: 'FAILED', tranRef },
    });
    logger.info({ cartId, responseStatus }, 'PayTabs top-up failed');
    return;
  }

  let credited = false;
  await prisma.$transaction(async (tx) => {
    // Atomic idempotency guard: claim the row only if still PENDING.
    const claim = await tx.walletTopup.updateMany({
      where: { id: topup.id, status: 'PENDING' },
      data: { status: 'COMPLETED', tranRef },
    });
    if (claim.count === 0) {
      return;
    } // a concurrent callback already handled it

    await walletService.applyTransaction(tx, {
      userId: topup.customerId,
      type: 'TOPUP',
      amount: Number(topup.amount),
      externalRef: tranRef || topup.cartId,
      note: 'Wallet top-up via PayTabs',
    });
    credited = true;
  });

  if (!credited) {
    return;
  }

  const amountStr = Number(topup.amount).toFixed(2);
  logger.info(
    { cartId, userId: topup.customerId, amount: amountStr },
    'Wallet top-up credited via PayTabs',
  );

  try {
    await notify({
      userId: topup.customerId,
      type: 'TOPUP_RECEIVED',
      titleAr: 'تم شحن محفظتك',
      titleEn: 'Wallet topped up',
      bodyAr: `تم إضافة ${amountStr} ر.س إلى محفظتك.`,
      bodyEn: `${amountStr} SAR was added to your wallet.`,
      data: { amount: amountStr },
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'TOPUP_RECEIVED notification failed (non-fatal)');
  }
};

module.exports = { completeTopupFromCallback };

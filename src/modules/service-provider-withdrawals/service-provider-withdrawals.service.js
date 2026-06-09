const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { notify } = require('../notifications/notifications.service');

/**
 * Service Provider withdrawal flow — FRD §3.5.2.
 *
 * Rules at create:
 *   - SP must have a wallet (always true since they're SERVICE_PROVIDER).
 *   - amount ≤ current wallet balance.
 *   - Exactly one PENDING request at a time per SP (simpler than letting
 *     multiple PENDINGs sum-validate against balance, and matches the
 *     reality of admin manually wiring money once at a time).
 *
 * No wallet movement on create — the admin is the one who actually
 * wires the bank transfer, so we debit the SP's wallet only at the
 * APPROVED moment (handled in admin-withdrawals.service).
 */

const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const serialize = (w) => ({
  id: w.id,
  amount: money(w.amount),
  method: w.method,
  bankName: w.bankName,
  bankAccountIban: w.bankAccountIban,
  accountHolderName: w.accountHolderName,
  walletName: w.walletName,
  walletId: w.walletId,
  status: w.status,
  reviewedById: w.reviewedById,
  reviewedAt: w.reviewedAt,
  bankTransferRef: w.bankTransferRef,
  adminNote: w.adminNote,
  cancellationReason: w.cancellationReason,
  walletTransactionId: w.walletTransactionId,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const create = async (spUserId, data) => {
  const sp = await prisma.serviceProvider.findFirst({
    where: { userId: spUserId, deletedAt: null },
  });
  if (!sp) {
    throw ApiError.notFound('Service provider not found');
  }

  // FRD §2.1: "Providers can request a withdrawal only if no commission
  // is owed." Commission on CASH jobs is settled when the SP confirms
  // "Amount Received"; until then those completed cash bookings are debts.
  const owed = await prisma.booking.count({
    where: {
      assignedSpId: spUserId,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      cashReceivedAt: null,
      commissionAmount: { gt: 0 },
    },
  });
  if (owed > 0) {
    throw ApiError.conflict(
      'You have unsettled commission on completed cash bookings. Confirm "Amount Received" on them before requesting a withdrawal.',
    );
  }

  const currentBalance = Number(sp.walletBalance);
  if (Number(data.amount) > currentBalance) {
    throw ApiError.badRequest(
      `Insufficient wallet balance — current: ${currentBalance.toFixed(2)}, requested: ${Number(data.amount).toFixed(2)}`,
    );
  }

  const pending = await prisma.withdrawalRequest.findFirst({
    where: { spId: spUserId, status: 'PENDING' },
  });
  if (pending) {
    throw ApiError.conflict(
      'You already have a pending withdrawal request. Wait for admin review or cancel it first.',
    );
  }

  const method = data.method || 'BANK';
  const created = await prisma.withdrawalRequest.create({
    data: {
      spId: spUserId,
      amount: Number(data.amount).toFixed(2),
      method,
      ...(method === 'EWALLET'
        ? { walletName: data.walletName, walletId: data.walletId }
        : {
            bankName: data.bankName,
            bankAccountIban: data.bankAccountIban,
            accountHolderName: data.accountHolderName,
          }),
    },
  });

  logger.info(
    { withdrawalId: created.id, spId: spUserId, amount: data.amount },
    'SP withdrawal requested (PENDING)',
  );

  // FRD §2.4: "Withdrawal request submitted and under review."
  await notify({
    userId: spUserId,
    type: 'WITHDRAWAL_SUBMITTED',
    titleAr: 'تم استلام طلب السحب',
    titleEn: 'Withdrawal request submitted',
    bodyAr: `طلب سحب بمبلغ ${Number(data.amount).toFixed(2)} ريال قيد مراجعة الإدارة.`,
    bodyEn: `Your withdrawal request for ${Number(data.amount).toFixed(2)} SAR is under admin review.`,
    data: { withdrawalId: created.id },
  });

  return serialize(created);
};

const listMine = async (spUserId, { page, limit, status }) => {
  const skip = (page - 1) * limit;
  const where = { spId: spUserId, ...(status && { status }) };

  const [items, total] = await prisma.$transaction([
    prisma.withdrawalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return {
    items: items.map(serialize),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const ownedOrFail = async (spUserId, id) => {
  const w = await prisma.withdrawalRequest.findFirst({
    where: { id, spId: spUserId },
  });
  // 404 instead of 403 — object-capability: don't leak existence of
  // another SP's request.
  if (!w) {
    throw ApiError.notFound('Withdrawal request not found');
  }
  return w;
};

const getMine = async (spUserId, id) => serialize(await ownedOrFail(spUserId, id));

const cancel = async (spUserId, id, { reason }) => {
  const w = await ownedOrFail(spUserId, id);
  if (w.status !== 'PENDING') {
    throw ApiError.conflict(
      `Cannot cancel a withdrawal that is ${w.status}; only PENDING requests can be cancelled by the SP`,
    );
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancellationReason: reason || null,
    },
  });

  logger.info({ withdrawalId: id, spId: spUserId }, 'SP cancelled withdrawal request');
  return serialize(updated);
};

module.exports = { create, listMine, getMine, cancel };

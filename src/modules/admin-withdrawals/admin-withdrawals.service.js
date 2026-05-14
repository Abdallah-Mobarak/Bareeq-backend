const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const walletService = require('../../services/wallet.service');
const { notify } = require('../notifications/notifications.service');

/**
 * Admin withdrawal review — FRD §3.5.2.
 *
 * Approve flow (atomic):
 *   1. Apply WITHDRAWAL transaction on SP's wallet (debit). The
 *      wallet service throws 400 here if balance dropped below the
 *      requested amount since the SP submitted (e.g. an admin
 *      ADJUSTMENT_DEBIT in between). The whole transaction rolls back.
 *   2. Update the WithdrawalRequest row to APPROVED + capture
 *      reviewedById / reviewedAt / bankTransferRef / walletTransactionId.
 *
 * Reject flow:
 *   1. No wallet movement.
 *   2. Update row to REJECTED + reviewedById / reviewedAt / adminNote.
 *
 * In both cases the SP gets a notification with the decision + the
 * relevant context (bankTransferRef on approve, adminNote on reject).
 */

const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));

const serialize = (w) => ({
  id: w.id,
  spId: w.spId,
  sp: w.sp
    ? {
        id: w.sp.id,
        email: w.sp.email,
        nameAr: w.sp.nameAr,
        nameEn: w.sp.nameEn,
        phone: w.sp.phone,
      }
    : undefined,
  amount: money(w.amount),
  bankName: w.bankName,
  bankAccountIban: w.bankAccountIban,
  accountHolderName: w.accountHolderName,
  status: w.status,
  reviewedById: w.reviewedById,
  reviewedAt: w.reviewedAt,
  reviewedBy: w.reviewedBy
    ? { id: w.reviewedBy.id, nameAr: w.reviewedBy.nameAr, nameEn: w.reviewedBy.nameEn }
    : undefined,
  bankTransferRef: w.bankTransferRef,
  adminNote: w.adminNote,
  cancellationReason: w.cancellationReason,
  walletTransactionId: w.walletTransactionId,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const sortMap = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  // pendingFirst: PENDING rows surface first, then by oldest within group.
  // Prisma can't express conditional ordering directly, so we sort in
  // JS after fetch — acceptable for admin queue sizes.
  pendingFirst: { createdAt: 'asc' },
};

const list = async ({ page, limit, status, spId, sort }) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status && { status }),
    ...(spId && { spId }),
  };

  const rows = await prisma.withdrawalRequest.findMany({
    where,
    orderBy: sortMap[sort] || sortMap.pendingFirst,
    include: {
      sp: { select: { id: true, email: true, nameAr: true, nameEn: true, phone: true } },
      reviewedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });

  if (sort === 'pendingFirst') {
    rows.sort((a, b) => {
      const aP = a.status === 'PENDING' ? 0 : 1;
      const bP = b.status === 'PENDING' ? 0 : 1;
      if (aP !== bP) {
        return aP - bP;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  const total = rows.length;
  const pageRows = rows.slice(skip, skip + limit);

  return {
    items: pageRows.map(serialize),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const findOrFail = async (id) => {
  const w = await prisma.withdrawalRequest.findFirst({
    where: { id },
    include: {
      sp: { select: { id: true, email: true, nameAr: true, nameEn: true, phone: true } },
      reviewedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!w) {
    throw ApiError.notFound('Withdrawal request not found');
  }
  return w;
};

const getOne = async (id) => serialize(await findOrFail(id));

const approve = async (adminId, id, { bankTransferRef, adminNote }) => {
  const existing = await findOrFail(id);
  if (existing.status !== 'PENDING') {
    throw ApiError.conflict(
      `Cannot approve a withdrawal that is ${existing.status}; only PENDING requests can be approved`,
    );
  }

  // Approve + debit wallet atomically.
  const result = await prisma.$transaction(async (tx) => {
    // applyTransaction will throw 400 if balance dropped below amount
    // since submission (e.g. admin ran an ADJUSTMENT_DEBIT). The
    // transaction rolls back — no APPROVED row, no debit.
    const { txn } = await walletService.applyTransaction(tx, {
      userId: existing.spId,
      type: 'WITHDRAWAL',
      amount: existing.amount,
      note: `Withdrawal ${existing.id.slice(0, 8)} — bank ref ${bankTransferRef}`,
    });

    const updated = await tx.withdrawalRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        bankTransferRef,
        adminNote: adminNote || null,
        walletTransactionId: txn.id,
      },
      include: {
        sp: { select: { id: true, email: true, nameAr: true, nameEn: true, phone: true } },
        reviewedBy: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });

    return updated;
  });

  logger.info(
    { withdrawalId: id, adminId, amount: existing.amount, bankTransferRef },
    'Withdrawal approved + wallet debited',
  );

  // Tell the SP — outside the txn (fire-and-forget; never blocks).
  await notify({
    userId: existing.spId,
    type: 'WITHDRAWAL_APPROVED',
    titleAr: 'تمت الموافقة على طلب السحب',
    titleEn: 'Withdrawal approved',
    bodyAr: `تم تحويل ${money(existing.amount)} ر.س إلى حسابك البنكي. مرجع التحويل: ${bankTransferRef}`,
    bodyEn: `${money(existing.amount)} SAR has been transferred to your bank. Reference: ${bankTransferRef}`,
    data: {
      withdrawalId: id,
      amount: money(existing.amount),
      bankTransferRef,
    },
  });

  return serialize(result);
};

const reject = async (adminId, id, { adminNote }) => {
  const existing = await findOrFail(id);
  if (existing.status !== 'PENDING') {
    throw ApiError.conflict(
      `Cannot reject a withdrawal that is ${existing.status}; only PENDING requests can be rejected`,
    );
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedById: adminId,
      reviewedAt: new Date(),
      adminNote,
    },
    include: {
      sp: { select: { id: true, email: true, nameAr: true, nameEn: true, phone: true } },
      reviewedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });

  logger.info({ withdrawalId: id, adminId, reason: adminNote }, 'Withdrawal rejected');

  await notify({
    userId: existing.spId,
    type: 'WITHDRAWAL_REJECTED',
    titleAr: 'تم رفض طلب السحب',
    titleEn: 'Withdrawal rejected',
    bodyAr: `لم تتم الموافقة على طلب سحب ${money(existing.amount)} ر.س: ${adminNote}`,
    bodyEn: `Your ${money(existing.amount)} SAR withdrawal was not approved: ${adminNote}`,
    data: {
      withdrawalId: id,
      amount: money(existing.amount),
      reason: adminNote,
    },
  });

  return serialize(updated);
};

module.exports = { list, getOne, approve, reject };

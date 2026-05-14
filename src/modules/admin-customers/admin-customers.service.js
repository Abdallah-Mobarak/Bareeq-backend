const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Customer management (FRD §3.2.1).
 *
 * On block (status = BLOCKED) we ALSO revoke every active refresh
 * token so the customer is signed out across their devices. The
 * access token is short-lived (15min) and stateless, so we don't
 * need to maintain a blacklist — once it expires the next /refresh
 * will be rejected by login flow which re-checks status.
 *
 * The `reason` field is optional and currently audit-only (logged).
 * When admin notifications ship in Sprint 4, blocking will surface
 * the reason in the customer's "your account was disabled" message.
 */

const serializeListRow = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  status: user.status,
  profilePicture: user.customer?.profilePicture || null,
  walletBalance: user.customer?.walletBalance.toString() || '0',
  createdAt: user.createdAt,
});

const serializeDetail = (user) => ({
  ...serializeListRow(user),
  updatedAt: user.updatedAt,
  customerId: user.customer?.id || null,
});

const sortMap = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { nameAr: 'asc' },
};

const list = async ({ page, limit, q, status, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(status && { status }),
    ...(q && {
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortMap[sort] || sortMap.newest,
      include: { customer: true },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(serializeListRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const findOrFail = async (id) => {
  const user = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER', deletedAt: null },
    include: { customer: true },
  });
  if (!user) {
    throw ApiError.notFound('Customer not found');
  }
  return user;
};

const getOne = async (id) => serializeDetail(await findOrFail(id));

const updateStatus = async (id, { status, reason }) => {
  const user = await findOrFail(id);

  if (user.status === status) {
    // Idempotent — nothing to do, but we still return the current row
    // so the admin UI can refresh from a single response shape.
    return serializeDetail(user);
  }

  // BLOCKING ⇒ revoke active refresh tokens. UNBLOCKING ⇒ no token
  // action (tokens were already revoked when they were blocked).
  const txn = [prisma.user.update({ where: { id }, data: { status } })];
  if (status === 'BLOCKED') {
    txn.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  const [updated] = await prisma.$transaction(txn);
  const refetched = await prisma.user.findUnique({
    where: { id: updated.id },
    include: { customer: true },
  });

  logger.info(
    { userId: id, from: user.status, to: status, reason: reason || null },
    'Admin updated customer status',
  );

  return serializeDetail(refetched);
};

module.exports = { list, getOne, updateStatus };

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Service Provider management (FRD §3.2.2 + §2.1).
 *
 * Two mutations:
 *   1. status (ENABLED ↔ BLOCKED) — identical semantics to admin-customers.
 *   2. KYC decision (→ APPROVED | REJECTED).
 *
 * On KYC APPROVED:
 *   - kycStatus  = APPROVED
 *   - isVerified = true        (denormalised flag for fast filtering)
 *   - verifiedAt = now()
 *
 * On KYC REJECTED:
 *   - kycStatus  = REJECTED
 *   - isVerified = false
 *   - verifiedAt = null  (clear any prior verification timestamp; rejection
 *                        invalidates whatever was approved before)
 *
 * Why a single flexible endpoint instead of two separate ones:
 *   - Easier to extend (e.g. add NEEDS_RESUBMIT later — one new value
 *     in the enum, no new endpoint).
 *   - The DECISION transition is a single state event; both approve
 *     and reject share notification + audit hooks (Sprint 4).
 */

const serializeListRow = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  status: user.status,
  serviceProviderId: user.serviceProvider?.id || null,
  profilePicture: user.serviceProvider?.profilePicture || null,
  bio: user.serviceProvider?.bio || null,
  isVerified: user.serviceProvider?.isVerified ?? false,
  kycStatus: user.serviceProvider?.kycStatus || null,
  verifiedAt: user.serviceProvider?.verifiedAt || null,
  walletBalance: user.serviceProvider?.walletBalance.toString() || '0',
  ratingAverage: user.serviceProvider?.ratingAverage
    ? user.serviceProvider.ratingAverage.toString()
    : null,
  ratingCount: user.serviceProvider?.ratingCount ?? 0,
  createdAt: user.createdAt,
});

const serializeDetail = (user) => ({
  ...serializeListRow(user),
  updatedAt: user.updatedAt,
});

const sortMap = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  name: [{ nameAr: 'asc' }],
  // For "rating" and "pendingFirst" we still order by user.createdAt
  // as a tie-break, but Prisma orderBy on a relation column needs a
  // raw query — for the MVP, list + sort in JS after fetch. Acceptable
  // for a small SP catalog; revisit if it gets hot.
  rating: [{ createdAt: 'desc' }],
  pendingFirst: [{ createdAt: 'desc' }],
};

const list = async ({ page, limit, q, status, kycStatus, isVerified, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    role: 'SERVICE_PROVIDER',
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
    ...((kycStatus || typeof isVerified === 'boolean') && {
      serviceProvider: {
        ...(kycStatus && { kycStatus }),
        ...(typeof isVerified === 'boolean' && { isVerified }),
      },
    }),
  };

  const rows = await prisma.user.findMany({
    where,
    orderBy: sortMap[sort] || sortMap.newest,
    include: { serviceProvider: true },
  });

  if (sort === 'rating') {
    rows.sort((a, b) => {
      const ra = Number(a.serviceProvider?.ratingAverage || 0);
      const rb = Number(b.serviceProvider?.ratingAverage || 0);
      return rb - ra;
    });
  }
  if (sort === 'pendingFirst') {
    rows.sort((a, b) => {
      const aP = a.serviceProvider?.kycStatus === 'PENDING' ? 0 : 1;
      const bP = b.serviceProvider?.kycStatus === 'PENDING' ? 0 : 1;
      return aP - bP;
    });
  }

  const total = rows.length;
  const pageRows = rows.slice(skip, skip + limit);

  return {
    items: pageRows.map(serializeListRow),
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
    where: { id, role: 'SERVICE_PROVIDER', deletedAt: null },
    include: { serviceProvider: true },
  });
  if (!user || !user.serviceProvider) {
    throw ApiError.notFound('Service provider not found');
  }
  return user;
};

const getOne = async (id) => serializeDetail(await findOrFail(id));

const updateStatus = async (id, { status, reason }) => {
  const user = await findOrFail(id);
  if (user.status === status) {
    return serializeDetail(user);
  }

  const txn = [prisma.user.update({ where: { id }, data: { status } })];
  if (status === 'BLOCKED') {
    txn.push(
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  await prisma.$transaction(txn);
  const refetched = await prisma.user.findUnique({
    where: { id },
    include: { serviceProvider: true },
  });

  logger.info(
    { userId: id, from: user.status, to: status, reason: reason || null },
    'Admin updated SP status',
  );

  return serializeDetail(refetched);
};

const reviewKyc = async (id, { decision, notes }) => {
  const user = await findOrFail(id);

  const isApprove = decision === 'APPROVED';

  await prisma.serviceProvider.update({
    where: { userId: id },
    data: {
      kycStatus: decision,
      isVerified: isApprove,
      verifiedAt: isApprove ? new Date() : null,
    },
  });

  const refetched = await prisma.user.findUnique({
    where: { id },
    include: { serviceProvider: true },
  });

  logger.info(
    {
      userId: id,
      from: user.serviceProvider.kycStatus,
      to: decision,
      notes: notes || null,
    },
    'Admin reviewed SP KYC',
  );

  return serializeDetail(refetched);
};

module.exports = { list, getOne, updateStatus, reviewKyc };

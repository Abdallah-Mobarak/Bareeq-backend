const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Service Provider profile (FRD §2.1).
 *
 * Architectural twin of customer-profile.service. Adds SP-specific
 * fields (bio, KYC, ratings) to the serialiser. Kept as a sibling
 * rather than a generalised "marketplace profile" so the two flows
 * can diverge cleanly when SP gains KYC document upload, rating
 * appeals, or commission overrides.
 */

const serialize = (user, sp) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  profilePicture: sp.profilePicture,
  bio: sp.bio,
  isVerified: sp.isVerified,
  kycStatus: sp.kycStatus,
  verifiedAt: sp.verifiedAt,
  walletBalance: sp.walletBalance.toString(),
  ratingAverage: sp.ratingAverage ? sp.ratingAverage.toString() : null,
  ratingCount: sp.ratingCount,
  createdAt: sp.createdAt,
  updatedAt: sp.updatedAt,
});

const findOrFail = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'SERVICE_PROVIDER', deletedAt: null },
    include: { serviceProvider: true },
  });
  if (!user || !user.serviceProvider || user.serviceProvider.deletedAt) {
    throw ApiError.notFound('Service provider profile not found');
  }
  return user;
};

const getProfile = async (userId) => {
  const user = await findOrFail(userId);
  return serialize(user, user.serviceProvider);
};

const updateProfile = async (userId, patch) => {
  const user = await findOrFail(userId);

  if (patch.phone && patch.phone !== user.phone) {
    const clash = await prisma.user.findFirst({
      where: { phone: patch.phone, deletedAt: null, id: { not: userId } },
    });
    if (clash) {
      throw ApiError.conflict('Phone is already registered');
    }
  }

  const userPatch = {
    ...(patch.nameAr !== undefined && { nameAr: patch.nameAr }),
    ...(patch.nameEn !== undefined && { nameEn: patch.nameEn || null }),
    ...(patch.phone !== undefined && { phone: patch.phone || null }),
  };
  const spPatch = {
    ...(patch.profilePicture !== undefined && {
      profilePicture: patch.profilePicture || null,
    }),
    ...(patch.bio !== undefined && { bio: patch.bio || null }),
  };

  const [updatedUser, updatedSp] = await prisma.$transaction([
    Object.keys(userPatch).length > 0
      ? prisma.user.update({ where: { id: userId }, data: userPatch })
      : prisma.user.findUnique({ where: { id: userId } }),
    Object.keys(spPatch).length > 0
      ? prisma.serviceProvider.update({ where: { userId }, data: spPatch })
      : prisma.serviceProvider.findUnique({ where: { userId } }),
  ]);

  logger.info({ userId }, 'Service provider profile updated');
  return serialize(updatedUser, updatedSp);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'SERVICE_PROVIDER', deletedAt: null },
  });
  if (!user) {
    throw ApiError.notFound('Service provider not found');
  }

  const ok = await password.compare(currentPassword, user.password);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const newHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ userId }, 'Service provider password changed');
};

module.exports = { getProfile, updateProfile, changePassword };

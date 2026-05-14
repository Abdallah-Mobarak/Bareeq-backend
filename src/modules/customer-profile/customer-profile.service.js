const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Customer profile (FRD §1.1).
 *
 * Read returns the joined User + Customer satellite. Edit touches
 * the appropriate row for each field (User for name/phone, Customer
 * for profilePicture/wallet).
 *
 * Phone uniqueness: the User table has a unique index on phone, but
 * since the user might be CHANGING from one valid phone to another,
 * we pre-check explicitly to give a clean 409 message instead of
 * surfacing the Prisma constraint error.
 *
 * Password change: we require the current password (not just the
 * access token) so a stolen short-lived JWT cannot rotate credentials
 * without the actual secret. On success, every active refresh token
 * is revoked — same defence-in-depth as password reset.
 */

const serialize = (user, customer) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  profilePicture: customer.profilePicture,
  walletBalance: customer.walletBalance.toString(),
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
});

const findOrFail = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER', deletedAt: null },
    include: { customer: true },
  });
  if (!user || !user.customer || user.customer.deletedAt) {
    throw ApiError.notFound('Customer profile not found');
  }
  return user;
};

const getProfile = async (userId) => {
  const user = await findOrFail(userId);
  return serialize(user, user.customer);
};

const updateProfile = async (userId, patch) => {
  const user = await findOrFail(userId);

  // Pre-check phone uniqueness so we give a clean 409 instead of
  // surfacing the Prisma unique-constraint error.
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
  const customerPatch = {
    ...(patch.profilePicture !== undefined && {
      profilePicture: patch.profilePicture || null,
    }),
  };

  const [updatedUser, updatedCustomer] = await prisma.$transaction([
    Object.keys(userPatch).length > 0
      ? prisma.user.update({ where: { id: userId }, data: userPatch })
      : prisma.user.findUnique({ where: { id: userId } }),
    Object.keys(customerPatch).length > 0
      ? prisma.customer.update({ where: { userId }, data: customerPatch })
      : prisma.customer.findUnique({ where: { userId } }),
  ]);

  logger.info({ userId }, 'Customer profile updated');
  return serialize(updatedUser, updatedCustomer);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER', deletedAt: null },
  });
  if (!user) {
    throw ApiError.notFound('Customer not found');
  }

  const ok = await password.compare(currentPassword, user.password);
  if (!ok) {
    // Same generic message we use for login — never reveal whether
    // "user doesn't exist" vs "wrong current password".
    throw ApiError.unauthorized('Invalid credentials');
  }

  const newHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    }),
    // Defence-in-depth: revoke every active refresh token so a
    // potentially compromised device is logged out.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ userId }, 'Customer password changed');
};

module.exports = { getProfile, updateProfile, changePassword };

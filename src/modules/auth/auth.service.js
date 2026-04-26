const crypto = require('node:crypto');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { signAccessToken } = require('../../utils/jwt');
const { config } = require('../../config/env');
const { logger } = require('../../utils/logger');

const isEmail = (s) => s.includes('@');

/**
 * Strip sensitive fields before sending a User over the wire.
 * Never leak `password`, even hashed, and never leak `deletedAt`.
 */
const serializeUser = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  permissionRoleId: user.permissionRoleId,
});

/**
 * Generate a fresh refresh-token + persist its hash.
 * The plain string is returned to the caller (sent to the client once);
 * only the SHA-256 hash is stored. A DB leak does NOT compromise sessions.
 */
const issueRefreshToken = async (userId, deviceInfo) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date(Date.now() + config.refreshToken.expiresInDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      deviceInfo: deviceInfo ?? null,
      expiresAt,
    },
  });

  return token;
};

/**
 * Login flow:
 *   1. Find user by email or phone (depending on shape of identifier).
 *   2. Reject blocked accounts.
 *   3. Compare password (constant-time bcrypt).
 *   4. Issue access + refresh tokens.
 *
 * Error message is intentionally identical for "no user" and "wrong password"
 * so an attacker can't enumerate valid emails.
 */
const login = async ({ identifier, password: plainPassword, deviceInfo }) => {
  const field = isEmail(identifier) ? 'email' : 'phone';

  const user = await prisma.user.findFirst({
    where: { [field]: identifier, deletedAt: null },
  });

  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.status === 'BLOCKED') {
    throw ApiError.forbidden('Account is blocked');
  }

  const passwordOk = await password.compare(plainPassword, user.password);
  if (!passwordOk) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    permissionRoleId: user.permissionRoleId,
  });

  const refreshToken = await issueRefreshToken(user.id, deviceInfo);

  logger.info({ userId: user.id, role: user.role }, 'User logged in');

  return {
    user: serializeUser(user),
    accessToken,
    refreshToken,
    accessTokenExpiresIn: config.jwt.accessExpiresIn,
  };
};

module.exports = { login };

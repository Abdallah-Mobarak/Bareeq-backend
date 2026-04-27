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

/**
 * Refresh access + refresh tokens (rotation).
 *
 * Why rotate?
 *   The previous refresh token is revoked the moment it's used. If an
 *   attacker steals one and races the legitimate user, only one of them
 *   will succeed; the loser's next refresh attempt will fail and raise
 *   suspicion. Without rotation, a stolen token is valid for its full
 *   7-day window with no way to detect misuse.
 */
const refresh = async ({ refreshToken: oldToken, deviceInfo }) => {
  const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: oldHash },
    include: { user: true },
  });

  // Token unknown, revoked, or expired ⇒ same generic 401
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  if (stored.user.deletedAt) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  if (stored.user.status === 'BLOCKED') {
    throw ApiError.forbidden('Account is blocked');
  }

  const newToken = crypto.randomBytes(32).toString('base64url');
  const newHash = crypto.createHash('sha256').update(newToken).digest('hex');
  const newExpiresAt = new Date(
    Date.now() + config.refreshToken.expiresInDays * 24 * 60 * 60 * 1000,
  );

  // Atomic swap: revoke the old, insert the new. Either both happen or neither.
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newHash,
        deviceInfo: deviceInfo ?? null,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: stored.user.id,
    role: stored.user.role,
    permissionRoleId: stored.user.permissionRoleId,
  });

  logger.info({ userId: stored.user.id }, 'Tokens refreshed');

  return {
    accessToken,
    refreshToken: newToken,
    accessTokenExpiresIn: config.jwt.accessExpiresIn,
  };
};

/**
 * Logout: revoke the given refresh token. Idempotent — calling it twice
 * is fine, and we don't leak whether the token existed.
 *
 * Note: the access token itself is not revoked (JWTs are stateless).
 * It will simply die at its 15-minute expiry.
 */
const logout = async ({ refreshToken: token }) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

/**
 * Fetch the authenticated user fresh from the DB.
 * We don't trust the JWT alone for /me because:
 *   - Status may have flipped to BLOCKED since the token was issued
 *   - Profile fields may have been edited
 *   - Permission role may have been changed
 */
const getMe = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  if (user.status === 'BLOCKED') {
    throw ApiError.forbidden('Account is blocked');
  }

  return serializeUser(user);
};

module.exports = { login, refresh, logout, getMe };

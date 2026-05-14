const crypto = require('node:crypto');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { signAccessToken } = require('../../utils/jwt');
const { config } = require('../../config/env');
const { logger } = require('../../utils/logger');

const isEmail = (s) => s.includes('@');

/**
 * Load the user's full PermissionRole (with permission catalog rows) for
 * the auth responses. Returns null when:
 *   - the user has no permissionRoleId (e.g. supervisor, bootstrap admin,
 *     customer, SP)
 *   - the permissionRoleId points at a soft-deleted / missing row
 *
 * The frontend uses this to render menu items and buttons immediately on
 * login without an extra round-trip. NOTE: this is a UI hint only — the
 * `requirePermission` middleware re-checks against the DB on every
 * request, so if an admin revokes a key mid-session it still takes
 * effect within the access-token lifetime.
 */
const loadPermissionRoleForResponse = async (permissionRoleId) => {
  if (!permissionRoleId) {
    return null;
  }
  const role = await prisma.permissionRole.findFirst({
    where: { id: permissionRoleId, deletedAt: null },
    include: {
      permissions: { include: { permission: true } },
    },
  });
  if (!role) {
    return null;
  }
  return {
    id: role.id,
    name: role.name,
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      key: rp.permission.key,
      module: rp.permission.module,
      descriptionAr: rp.permission.descriptionAr,
      descriptionEn: rp.permission.descriptionEn,
    })),
  };
};

/**
 * Strip sensitive fields before sending a User over the wire.
 * Never leak `password`, even hashed, and never leak `deletedAt`.
 *
 * `permissionRole` is the optional inflated role object (see
 * loadPermissionRoleForResponse). When null, the frontend treats:
 *   - ADMIN  → bootstrap / root admin = full access
 *   - other  → no permissions (role uses fixed capabilities)
 */
const serializeUser = (user, permissionRole = null) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  nameAr: user.nameAr,
  nameEn: user.nameEn,
  permissionRoleId: user.permissionRoleId,
  permissionRole,
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
const login = async ({ identifier, password: plainPassword, deviceInfo, clientType }) => {
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

  /**
   * Per-role surface policy — read straight from the FRD:
   *
   *   SUPERVISOR        → mobile only       (FRD §1   "Supervisor Functionality Mobile Application")
   *   COMPANY_USER      → web AND mobile    (FRD §2   "Companies' Functionality Mobile and Web Application")
   *   ACCOUNTANT_MANAGER→ web only          (FRD §2 (AM) — no mobile mentioned, default to web)
   *   MANAGER           → web only          (FRD §3   "Web Application Functionality for Managers")
   *   ADMIN             → web only          (FRD §4   "Web Application Functionality for Admins")
   *   CUSTOMER          → mobile only       (Marketplace §1 "Customer Mobile Application")
   *   SERVICE_PROVIDER  → mobile only       (Marketplace §2 "Service Provider Mobile Application")
   *
   * Each value is an array of allowed surfaces so a role can span both
   * (e.g. COMPANY_USER). When the FRD adds a new surface for a role we
   * append to that role's array — no other code changes.
   */
  const ROLE_CLIENT_MAP = {
    SUPERVISOR: ['mobile'],
    ADMIN: ['web'],
    MANAGER: ['web'],
    COMPANY_USER: ['web', 'mobile'],
    ACCOUNTANT_MANAGER: ['web'],
    CUSTOMER: ['mobile'],
    SERVICE_PROVIDER: ['mobile'],
  };
  const allowedClients = ROLE_CLIENT_MAP[user.role];
  if (allowedClients && !allowedClients.includes(clientType)) {
    /**
     * If the role is locked to a single surface we can give a precise
     * hint ("use the mobile app"). For multi-surface roles that's not
     * meaningful, so we fall back to a generic message. We never leak
     * the role name — that would help an attacker enumerate accounts.
     */
    const onlySurface = allowedClients.length === 1 ? allowedClients[0] : null;
    throw ApiError.forbidden(
      onlySurface === 'mobile'
        ? 'This account can only log in from the mobile application'
        : onlySurface === 'web'
          ? 'This account can only log in from the dashboard'
          : 'This account is not allowed to log in from this surface',
    );
  }

  /**
   * FRD §2 (Accountant Manager) FR-4 / FR-5: an AM cannot log in if the
   * parent Company's primary login user is blocked or missing. We treat
   * that as the company being "disabled" without adding a separate flag.
   */
  if (user.role === 'ACCOUNTANT_MANAGER' && user.companyId) {
    const companyLoginUser = await prisma.user.findFirst({
      where: { companyId: user.companyId, role: 'COMPANY_USER', deletedAt: null },
    });
    if (!companyLoginUser || companyLoginUser.status === 'BLOCKED') {
      throw ApiError.forbidden('Your company account is disabled');
    }
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

  const permissionRole = await loadPermissionRoleForResponse(user.permissionRoleId);

  logger.info({ userId: user.id, role: user.role }, 'User logged in');

  return {
    user: serializeUser(user, permissionRole),
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

  const permissionRole = await loadPermissionRoleForResponse(
    stored.user.permissionRoleId,
  );

  logger.info({ userId: stored.user.id }, 'Tokens refreshed');

  return {
    user: serializeUser(stored.user, permissionRole),
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

  const permissionRole = await loadPermissionRoleForResponse(user.permissionRoleId);
  return serializeUser(user, permissionRole);
};

module.exports = { login, refresh, logout, getMe };

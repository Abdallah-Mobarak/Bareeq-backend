const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const otp = require('../../utils/otp');
const { sendEmailBestEffort } = require('../../utils/mailer');
const { signupOtpEmail, passwordResetOtpEmail } = require('../../utils/email-templates');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/env');
const { notify } = require('../notifications/notifications.service');

/**
 * Service Provider self-signup + password reset (Marketplace §2.1).
 *
 * Architectural twin of customer-auth.service. Kept as a sibling rather
 * than a generalised "marketplace auth" because the two flows are
 * likely to diverge: SP will gain KYC document upload during signup,
 * Customer may gain address capture. A shared abstraction at this stage
 * would have to be unwound the moment that happens.
 *
 * Anti-enumeration policy mirrors customer-auth exactly:
 *   - Signup leaks "email already registered" (acceptable UX trade-off).
 *   - Password reset never leaks; the request endpoint always succeeds
 *     and the verify endpoint returns a generic message for every fail.
 */

const includeDevOtp = (payload, code) =>
  config.nodeEnv === 'production'
    ? payload
    : {
        ...payload,
        otp: code,
        devNote:
          'OTP is returned here ONLY in non-production. Replace mailer mock with a real provider before launch.',
      };

const findUserByEmail = (email) => prisma.user.findFirst({ where: { email, deletedAt: null } });

/**
 * Public list of "Service Types" for the signup dropdown (FRD §2.1 —
 * "Service Type (Selectable, managed by admin)"). Reuses the active
 * ServiceCategory catalog. No auth: the signup screen runs pre-login.
 */
const listServiceTypes = async () => {
  const categories = await prisma.serviceCategory.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { titleAr: 'asc' }],
    select: { id: true, titleAr: true, titleEn: true, iconUrl: true },
  });
  return { items: categories };
};

/**
 * Assert the SP-picked service type exists, is active, and not deleted.
 * Throws a 400 otherwise so a stale/invalid id can't slip through signup.
 */
const assertServiceCategory = async (serviceCategoryId) => {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: serviceCategoryId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!category) {
    throw ApiError.badRequest('Invalid service type');
  }
};

const requestSignup = async ({
  email,
  password: plainPassword,
  nameAr,
  nameEn,
  phone,
  bio,
  serviceCategoryId,
}) => {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw ApiError.conflict('Email is already registered');
  }

  await assertServiceCategory(serviceCategoryId);

  if (phone) {
    const phoneClash = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
    });
    if (phoneClash) {
      throw ApiError.conflict('Phone is already registered');
    }
  }

  const { code, expiresAt } = await otp.issueCode(email, 'SERVICE_PROVIDER_SIGNUP');

  await sendEmailBestEffort({
    to: email,
    ...signupOtpEmail({
      nameAr,
      nameEn,
      code,
      ttlMinutes: otp.TTL_MINUTES,
      isServiceProvider: true,
    }),
  });

  void plainPassword;
  void nameEn;
  void bio;

  logger.info({ email }, 'Service provider signup OTP issued');

  return includeDevOtp({ email, expiresAt, ttlMinutes: otp.TTL_MINUTES }, code);
};

const verifySignup = async ({
  email,
  password: plainPassword,
  nameAr,
  nameEn,
  phone,
  bio,
  serviceCategoryId,
  otp: submittedOtp,
}) => {
  await otp.verifyCode(email, 'SERVICE_PROVIDER_SIGNUP', submittedOtp);

  const existing = await findUserByEmail(email);
  if (existing) {
    throw ApiError.conflict('Email is already registered');
  }
  if (phone) {
    const phoneClash = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
    });
    if (phoneClash) {
      throw ApiError.conflict('Phone is already registered');
    }
  }

  await assertServiceCategory(serviceCategoryId);

  const passwordHash = await password.hash(plainPassword);

  const newUserId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone: phone || null,
        password: passwordHash,
        role: 'SERVICE_PROVIDER',
        nameAr,
        nameEn: nameEn || null,
        // FRD §2.1: the account is created DISABLED and stays unable to
        // log in until an admin approves it (PATCH /admin/service-
        // providers/:id/status → ENABLED). Login already blocks BLOCKED.
        status: 'BLOCKED',
      },
    });

    await tx.serviceProvider.create({
      data: {
        userId: user.id,
        bio: bio || null,
        serviceCategoryId,
        // kycStatus defaults to NOT_SUBMITTED — admin review happens
        // later via a separate KYC submission flow (Sprint 4).
      },
    });

    return user.id;
  });

  await notify({
    userId: newUserId,
    type: 'SERVICE_PROVIDER_WELCOME',
    titleAr: 'أهلاً بك في بريق',
    titleEn: 'Welcome to Bareeq',
    bodyAr: `مرحباً ${nameAr}، تم إنشاء حسابك وهو قيد مراجعة الإدارة. ستتمكن من تسجيل الدخول بعد الموافقة عليه.`,
    bodyEn: `Hi ${nameEn || nameAr}, your account was created and is pending admin approval. You can log in once it is approved.`,
  });

  logger.info({ email }, 'Service provider account created (pending admin approval)');

  // No auto-login: the account is disabled until an admin approves it.
  return {
    email,
    status: 'PENDING_APPROVAL',
    message: 'Your account was created and is pending admin approval.',
  };
};

const requestPasswordReset = async ({ email }) => {
  const user = await prisma.user.findFirst({
    where: { email, role: 'SERVICE_PROVIDER', deletedAt: null },
  });

  let issuedCode = null;
  if (user) {
    const { code } = await otp.issueCode(email, 'SERVICE_PROVIDER_PASSWORD_RESET');
    issuedCode = code;
    await sendEmailBestEffort({
      to: email,
      ...passwordResetOtpEmail({
        nameAr: user.nameAr,
        nameEn: user.nameEn,
        code,
        ttlMinutes: otp.TTL_MINUTES,
      }),
    });
    logger.info({ email }, 'Service provider password-reset OTP issued');
  } else {
    logger.info({ email }, 'Service provider password-reset requested for unknown email');
  }

  return issuedCode
    ? includeDevOtp({ email, ttlMinutes: otp.TTL_MINUTES }, issuedCode)
    : { email, ttlMinutes: otp.TTL_MINUTES };
};

const confirmPasswordReset = async ({ email, otp: submittedOtp, newPassword }) => {
  await otp.verifyCode(email, 'SERVICE_PROVIDER_PASSWORD_RESET', submittedOtp);

  const user = await prisma.user.findFirst({
    where: { email, role: 'SERVICE_PROVIDER', deletedAt: null },
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired code');
  }

  const newHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: newHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ userId: user.id }, 'Service provider password reset');

  return { email };
};

module.exports = {
  listServiceTypes,
  requestSignup,
  verifySignup,
  requestPasswordReset,
  confirmPasswordReset,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const otp = require('../../utils/otp');
const { sendEmail } = require('../../utils/mailer');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/env');
const authService = require('../auth/auth.service');
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

const requestSignup = async ({ email, password: plainPassword, nameAr, nameEn, phone, bio }) => {
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

  const { code, expiresAt } = await otp.issueCode(email, 'SERVICE_PROVIDER_SIGNUP');

  await sendEmail({
    to: email,
    subject: 'Bareeq — verify your service provider account',
    body:
      `Hello ${nameEn || nameAr},\n\n` +
      `Your Bareeq verification code is: ${code}\n` +
      `It expires in ${otp.TTL_MINUTES} minutes.\n\n` +
      `If you didn't try to sign up, ignore this email.`,
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
  otp: submittedOtp,
  deviceInfo,
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
      },
    });

    await tx.serviceProvider.create({
      data: {
        userId: user.id,
        bio: bio || null,
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
    bodyAr: `مرحباً ${nameAr}، حسابك جاهز. أكمل ملفك وارفع مستنداتك لبدء استلام الحجوزات.`,
    bodyEn: `Hi ${nameEn || nameAr}, your account is ready. Complete your profile and submit KYC to start receiving bookings.`,
  });

  logger.info({ email }, 'Service provider account created');

  return authService.login({
    identifier: email,
    password: plainPassword,
    deviceInfo,
    clientType: 'mobile',
  });
};

const requestPasswordReset = async ({ email }) => {
  const user = await prisma.user.findFirst({
    where: { email, role: 'SERVICE_PROVIDER', deletedAt: null },
  });

  let issuedCode = null;
  if (user) {
    const { code } = await otp.issueCode(email, 'SERVICE_PROVIDER_PASSWORD_RESET');
    issuedCode = code;
    await sendEmail({
      to: email,
      subject: 'Bareeq — password reset code',
      body:
        `Hello ${user.nameEn || user.nameAr},\n\n` +
        `Your password reset code is: ${code}\n` +
        `It expires in ${otp.TTL_MINUTES} minutes.\n\n` +
        `If you didn't request a reset, ignore this email.`,
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
  requestSignup,
  verifySignup,
  requestPasswordReset,
  confirmPasswordReset,
};

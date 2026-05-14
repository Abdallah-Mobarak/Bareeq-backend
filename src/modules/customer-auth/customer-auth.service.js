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
 * In non-production we surface the OTP in the response so developers can
 * smoke-test the flow without a real mailer. Same MVP convenience as
 * visit-documentation.service. Stripped automatically in production.
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

/**
 * Customer self-signup + password reset (Marketplace §1.1).
 *
 * Why split request/verify into two endpoints (instead of one form
 * submission with the OTP inline):
 *   - The OTP needs a fresh delivery before the client can know it.
 *   - Validating the payload twice (once on request, once on verify)
 *     gives us symmetric checks; the verify call is the source of
 *     truth — if a field changes between the two calls, verify wins.
 *
 * Anti-enumeration policy:
 *   - Signup: WE DO leak "email already registered" — every signup
 *     form on the internet does, and the alternative is a worse UX
 *     for the legitimate 99% of users.
 *   - Password reset: WE DO NOT leak. The request endpoint always
 *     returns success; the verify-OTP endpoint returns a generic
 *     "Invalid or expired code" for every failure mode.
 */

/**
 * Look up an existing User row by email regardless of role. We block
 * cross-role email reuse so an admin's email can't be claimed by a
 * customer (and vice-versa).
 */
const findUserByEmail = (email) => prisma.user.findFirst({ where: { email, deletedAt: null } });

/**
 * Step 1 — request a signup OTP.
 *
 * Pre-checks the email and issues a fresh OTP. The User row is NOT
 * created here; that happens only after successful OTP verification.
 */
const requestSignup = async ({ email, password: plainPassword, nameAr, nameEn, phone }) => {
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

  const { code, expiresAt } = await otp.issueCode(email, 'CUSTOMER_SIGNUP');

  await sendEmail({
    to: email,
    subject: 'Bareeq — verify your email',
    body:
      `Hello ${nameEn || nameAr},\n\n` +
      `Your Bareeq verification code is: ${code}\n` +
      `It expires in ${otp.TTL_MINUTES} minutes.\n\n` +
      `If you didn't try to sign up, ignore this email.`,
  });

  // unused destructure args silence the linter; we accept them in the
  // signature so the controller can pass req.body straight through.
  void plainPassword;
  void nameEn;

  logger.info({ email }, 'Customer signup OTP issued');

  return includeDevOtp({ email, expiresAt, ttlMinutes: otp.TTL_MINUTES }, code);
};

/**
 * Step 2 — verify the OTP and create the account.
 *
 * On success we auto-login the freshly-created user (delegating to the
 * existing auth.service.login so the response shape matches the regular
 * mobile login flow exactly).
 */
const verifySignup = async ({
  email,
  password: plainPassword,
  nameAr,
  nameEn,
  phone,
  otp: submittedOtp,
  deviceInfo,
}) => {
  // Throws ApiError.badRequest('Invalid or expired code') on any failure.
  // We deliberately let that error propagate as-is.
  await otp.verifyCode(email, 'CUSTOMER_SIGNUP', submittedOtp);

  // Re-check race conditions: someone could have grabbed the email or
  // phone between request and verify. The unique constraint is the
  // final line of defence, but the explicit check gives a cleaner error.
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
        role: 'CUSTOMER',
        nameAr,
        nameEn: nameEn || null,
      },
    });

    await tx.customer.create({
      data: { userId: user.id },
    });

    return user.id;
  });

  // Fire-and-forget welcome notification (errors swallowed by notify()).
  await notify({
    userId: newUserId,
    type: 'CUSTOMER_WELCOME',
    titleAr: 'أهلاً بك في بريق',
    titleEn: 'Welcome to Bareeq',
    bodyAr: `مرحباً ${nameAr}، حسابك جاهز. ابدأ تصفّح الخدمات!`,
    bodyEn: `Hi ${nameEn || nameAr}, your account is ready. Start exploring services!`,
  });

  logger.info({ email }, 'Customer account created');

  // Auto-login — same code path as a regular login from the mobile app.
  return authService.login({
    identifier: email,
    password: plainPassword,
    deviceInfo,
    clientType: 'mobile',
  });
};

/**
 * Password reset — request. Returns success regardless of whether the
 * email exists; we only issue an OTP if the account is real. This is
 * the anti-enumeration guarantee.
 */
const requestPasswordReset = async ({ email }) => {
  const user = await prisma.user.findFirst({
    where: { email, role: 'CUSTOMER', deletedAt: null },
  });

  let issuedCode = null;
  if (user) {
    const { code } = await otp.issueCode(email, 'CUSTOMER_PASSWORD_RESET');
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
    logger.info({ email }, 'Customer password-reset OTP issued');
  } else {
    logger.info({ email }, 'Customer password-reset requested for unknown email');
  }

  // Same response shape whether or not the email exists. In dev we tack
  // on the OTP only if one was actually issued — otherwise we'd leak
  // enumeration by the *presence* of the field.
  return issuedCode
    ? includeDevOtp({ email, ttlMinutes: otp.TTL_MINUTES }, issuedCode)
    : { email, ttlMinutes: otp.TTL_MINUTES };
};

/**
 * Password reset — confirm. Verifies the OTP, sets the new password,
 * and revokes every active refresh token for the account so any device
 * that might have been compromised is logged out.
 */
const confirmPasswordReset = async ({ email, otp: submittedOtp, newPassword }) => {
  // Throws ApiError.badRequest('Invalid or expired code') on any failure.
  await otp.verifyCode(email, 'CUSTOMER_PASSWORD_RESET', submittedOtp);

  const user = await prisma.user.findFirst({
    where: { email, role: 'CUSTOMER', deletedAt: null },
  });

  // If the user vanished between issue and confirm, present the same
  // generic message rather than leaking "account not found".
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

  logger.info({ userId: user.id }, 'Customer password reset');

  return { email };
};

module.exports = {
  requestSignup,
  verifySignup,
  requestPasswordReset,
  confirmPasswordReset,
};

const crypto = require('node:crypto');

const { prisma } = require('../infrastructure/database/prisma');
const { ApiError } = require('./ApiError');
const password = require('./password');

/**
 * Identifier-bound one-time codes (Marketplace §1.1, §2.1).
 *
 * Why this lives in utils, not a module:
 *   - The same primitive is used by Customer signup, SP signup,
 *     password reset, and (eventually) any future verification flow.
 *   - The visit-documentation OTP is *not* migrated to this — it
 *     stores its hash inline on `VisitInstance` because the entity
 *     always exists before the OTP is issued. Identifier-first OTPs
 *     (where the User row may not exist yet) need a separate table.
 *
 * Threat model addressed:
 *   - Replay → codes are single-use (`consumedAt` set on verify).
 *   - Brute force → MAX_ATTEMPTS per code; after that the row is
 *     burned and the user must request a fresh code.
 *   - Race / parallel codes → issuing a new code invalidates any
 *     prior unconsumed code for the same (identifier, purpose).
 *   - DB leak → only the bcrypt hash is stored.
 */

const TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

// Length is a per-call parameter (default 6) so Customer stays 6 digits while
// Service Provider uses 4 — passed explicitly by each caller's issueCode.
const generateCode = (length = CODE_LENGTH) =>
  String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');

/**
 * Issue a fresh one-time code for `identifier` + `purpose`.
 *
 * Side effects:
 *   1. Marks every prior unconsumed code for this (identifier, purpose)
 *      as consumed — keeps "verify" deterministic and blocks parallel
 *      brute force across multiple issued codes.
 *   2. Stores a new row with the bcrypt hash.
 *
 * Returns the *plaintext* code to the caller. The caller is responsible
 * for delivering it via the right channel (email for signup, SMS later).
 * The plaintext never leaves this function call — it is never logged
 * and never stored.
 *
 * @param {string} identifier email or phone the code is bound to
 * @param {'CUSTOMER_SIGNUP'|'SERVICE_PROVIDER_SIGNUP'|'CUSTOMER_PASSWORD_RESET'|'SERVICE_PROVIDER_PASSWORD_RESET'} purpose
 * @returns {Promise<{ code: string, expiresAt: Date }>}
 */
const issueCode = async (identifier, purpose, length = CODE_LENGTH) => {
  const code = generateCode(length);
  const codeHash = await password.hash(code);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.oneTimeCode.updateMany({
      where: { identifier, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.oneTimeCode.create({
      data: { identifier, codeHash, purpose, expiresAt },
    }),
  ]);

  return { code, expiresAt };
};

/**
 * Verify a code submitted by the user.
 *
 * Looks up the latest unconsumed code for (identifier, purpose),
 * checks expiry, compares the hash, and either marks the row consumed
 * (success) or increments `attempts` (failure).
 *
 * After MAX_ATTEMPTS failures the row is consumed — the user must
 * call `issueCode` again to get a fresh one.
 *
 * Error contract (intentional):
 *   - 400 "Invalid or expired code" → both "no code at all", "expired",
 *     and "wrong code" collapse to the same message. We do NOT reveal
 *     which one it is, so an attacker can't enumerate identifiers.
 *
 * @param {string} identifier
 * @param {string} purpose
 * @param {string} submitted plaintext code from the user
 * @returns {Promise<void>} resolves on success; throws ApiError on failure
 */
const verifyCode = async (identifier, purpose, submitted) => {
  const row = await prisma.oneTimeCode.findFirst({
    where: { identifier, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  // Same message for "no code" / "expired" / "wrong code" — see contract above.
  if (!row || row.expiresAt < new Date()) {
    throw ApiError.badRequest('Invalid or expired code');
  }

  const ok = await password.compare(submitted, row.codeHash);
  if (!ok) {
    const nextAttempts = row.attempts + 1;
    await prisma.oneTimeCode.update({
      where: { id: row.id },
      data: {
        attempts: nextAttempts,
        consumedAt: nextAttempts >= MAX_ATTEMPTS ? new Date() : undefined,
      },
    });
    throw ApiError.badRequest('Invalid or expired code');
  }

  await prisma.oneTimeCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
};

module.exports = { issueCode, verifyCode, TTL_MINUTES, MAX_ATTEMPTS };

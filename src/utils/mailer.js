const { logger } = require('./logger');

/**
 * Mailer abstraction. MVP implementation logs every "sent" email
 * so a developer can read OTPs and reset links out of the console
 * without wiring SMTP / SendGrid / SES yet.
 *
 * When we pick a provider (likely SES), replace the body of
 * `sendEmail` with the provider's SDK call. Every caller in the
 * codebase imports this same function, so the swap is local.
 *
 * Why a single `sendEmail` instead of `sendOtpEmail` / `sendResetEmail`:
 *   - Templates (subject + body) are the caller's concern; the mailer
 *     just delivers a rendered message.
 *   - Keeps the interface one function, easy to mock in tests.
 */

const sendEmail = async ({ to, subject, body }) => {
  logger.info(
    { to, subject, body },
    '[MOCK EMAIL] (replace with real provider before production)',
  );
};

module.exports = { sendEmail };

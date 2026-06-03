const nodemailer = require('nodemailer');

const { config } = require('../config/env');
const { ApiError } = require('./ApiError');
const { logger } = require('./logger');

/**
 * Single sendEmail abstraction used by every auth/OTP/reset flow.
 *
 * Transport resolution (lazy, on first send):
 *   1. SMTP_HOST + SMTP_USER + SMTP_PASSWORD set → real SMTP.
 *      Works in any env; swap providers (SES/Mailgun/SendGrid/Brevo)
 *      by changing env vars, not code.
 *   2. Dev/test env with SMTP missing → Ethereal test account.
 *      Mail is captured (not delivered) and a preview URL is logged
 *      so a developer can read the OTP in their browser.
 *   3. Production env with SMTP missing → throws on first send.
 *      Loud failure beats silent drop.
 *
 * Why lazy: server startup must not depend on SMTP being reachable.
 * Why a Promise cache: the Ethereal account fetch is async; we want
 * a single transporter shared across concurrent requests.
 *
 * Caller signature: { to, subject, html, text }.
 * Legacy callers pass `body` as plain text — mapped to `text` for
 * backward compatibility until templates are migrated.
 */

let transporterPromise = null;
let etherealMode = false;

const buildTransporter = async () => {
  const { host, port, user, password } = config.email.smtp;
  const hasSmtp = host && user && password;

  if (hasSmtp) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    });
  }

  if (config.isProduction) {
    throw ApiError.internal(
      'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD before production.',
    );
  }

  // Dev/test fallback. createTestAccount() hits Ethereal's REST API once
  // to mint a throwaway inbox; the credentials are valid for the lifetime
  // of this process.
  const testAccount = await nodemailer.createTestAccount();
  etherealMode = true;
  logger.warn(
    { etherealUser: testAccount.user },
    'Using Ethereal test SMTP — emails are captured, not delivered. ' +
      'Set SMTP_HOST/USER/PASSWORD in .env to send real emails.',
  );

  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
};

const getTransporter = () => {
  if (!transporterPromise) {
    // Reset on failure so a fixed env can be retried without restarting the process.
    transporterPromise = buildTransporter().catch((err) => {
      transporterPromise = null;
      throw err;
    });
  }
  return transporterPromise;
};

const sendEmail = async ({ to, subject, html, text, body }) => {
  const transporter = await getTransporter();

  const result = await transporter.sendMail({
    from: config.email.from,
    to,
    subject,
    text: text ?? body,
    html: html ?? undefined,
  });

  if (etherealMode) {
    logger.info(
      { to, subject, preview: nodemailer.getTestMessageUrl(result) },
      'Email captured by Ethereal — open the preview URL to view it',
    );
  } else {
    logger.info({ to, subject, messageId: result.messageId }, 'Email sent');
  }

  return result;
};

module.exports = { sendEmail };

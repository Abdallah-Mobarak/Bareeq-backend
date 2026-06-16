require('dotenv').config();

/**
 * Read a required env var. Exits the process if it's missing.
 * Catches configuration errors at startup instead of at runtime.
 * @param {string} key
 * @returns {string}
 */
const required = (key) => {
  const value = process.env[key];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
};

/**
 * Read an optional env var with a default value.
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
const optional = (key, defaultValue) => process.env[key] ?? defaultValue;

const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),
  apiPrefix: optional('API_PREFIX', '/api/v1'),

  // TEMPORARY test toggle. When true, OTP flows behave like dev even in
  // production: a failed email is non-fatal AND the OTP is echoed in the
  // API response so the app can read it without a real mailbox. Turn OFF
  // (remove / set false) before real launch.
  otpTestMode: optional('OTP_TEST_MODE', 'false') === 'true',
  // Master code that always passes OTP verification WHILE otpTestMode is on,
  // so a handed-out APK build can clear the OTP screen with no real mailbox.
  // 4 digits to match the Service Provider OTP format.
  // SECURITY: only honoured when OTP_TEST_MODE=true.
  otpTestCode: optional('OTP_TEST_CODE', '0000'),

  database: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
  },

  refreshToken: {
    expiresInDays: parseInt(optional('REFRESH_TOKEN_EXPIRES_IN_DAYS', '7'), 10),
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
  },

  email: {
    from: optional('EMAIL_FROM', 'Bareeq <noreply@bareeq.sa>'),
    smtp: {
      host: optional('SMTP_HOST', ''),
      port: parseInt(optional('SMTP_PORT', '587'), 10),
      user: optional('SMTP_USER', ''),
      password: optional('SMTP_PASSWORD', ''),
    },
  },
};

config.isDevelopment = config.nodeEnv === 'development';
config.isProduction = config.nodeEnv === 'production';
config.isTest = config.nodeEnv === 'test';

module.exports = { config };

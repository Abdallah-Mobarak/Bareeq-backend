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

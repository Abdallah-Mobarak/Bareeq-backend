const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/**
 * Sign an access token. Used at login and at refresh-token rotation.
 *
 * Payload conventions:
 *   sub              user id (subject)
 *   role             SystemRole enum value
 *   permissionRoleId optional dynamic permission role id
 *
 * The library adds `iat` and `exp` automatically.
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });

/**
 * Verify an access token. Throws if invalid or expired.
 * Returns the decoded payload.
 */
const verifyAccessToken = (token) => jwt.verify(token, config.jwt.accessSecret);

module.exports = { signAccessToken, verifyAccessToken };

const bcrypt = require('bcryptjs');

/**
 * Cost factor for bcrypt. 10 ≈ 100ms per hash on modern hardware —
 * fast enough for login flows, expensive enough to defeat brute force.
 * Increase only if you measure CPU headroom in production.
 */
const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password. NEVER store the plaintext.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash, safe to store
 */
const hash = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

/**
 * Constant-time compare a plaintext attempt against a stored hash.
 * @param {string} plain
 * @param {string} hashed
 * @returns {Promise<boolean>}
 */
const compare = (plain, hashed) => bcrypt.compare(plain, hashed);

module.exports = { hash, compare };

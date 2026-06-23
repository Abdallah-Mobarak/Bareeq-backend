/**
 * Normalise a stored media URL to a RELATIVE public path (/uploads/...).
 *
 * Why: uploaded assets are served by express.static at /uploads/* on
 * whatever host runs the API. Some legacy rows stored ABSOLUTE urls that
 * baked in one machine's address (e.g. http://192.168.1.22:3000/uploads/x)
 * which is unreachable from other devices. Returning a relative path lets
 * each client prepend its own API base URL, so the same value works
 * everywhere regardless of which host/port serves it.
 *
 * - falsy            → returned as-is (null/undefined/'')
 * - already relative → returned unchanged
 * - absolute http(s) → strips the scheme + host, keeps the path
 * - anything else    → returned unchanged
 */
const toRelativeUpload = (url) => {
  if (!url || typeof url !== 'string') {
    return url;
  }
  const match = url.match(/^https?:\/\/[^/]+(\/.*)$/i);
  return match ? match[1] : url;
};

module.exports = { toRelativeUpload };

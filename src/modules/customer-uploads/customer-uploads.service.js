const path = require('node:path');
const fs = require('node:fs/promises');

const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Customer booking-photo upload (Marketplace §1.3).
 *
 * Mirrors admin-uploads: files arrive as in-memory buffers (multer), we
 * persist them under <repo>/uploads/bookings and return RELATIVE public
 * URLs served by express.static at /uploads/*.
 *
 * Why relative (not absolute): the client prepends its own API base URL,
 * so the same stored value works no matter which host/port serves the
 * API. Absolute URLs bake in one machine's address and break on others.
 *
 * The returned urls are what the client then sends as `photoUrls` on
 * POST /customer/bookings.
 */
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'bookings');
const PUBLIC_PREFIX = '/uploads/bookings';

const extFromMime = (mime) => {
  if (mime === 'image/png') {
    return 'png';
  }
  if (mime === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
};

const uploadPhotos = async (files) => {
  if (!files || files.length === 0) {
    throw ApiError.badRequest('No image files provided (field name: "files")');
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const urls = await Promise.all(
    files.map(async (file) => {
      const ext = extFromMime(file.mimetype);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
      return `${PUBLIC_PREFIX}/${filename}`;
    }),
  );

  logger.info({ count: urls.length }, 'Customer booking photos uploaded');

  return { urls };
};

module.exports = { uploadPhotos };

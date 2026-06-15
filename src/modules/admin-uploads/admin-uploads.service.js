const path = require('node:path');
const fs = require('node:fs/promises');

const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Generic dashboard image upload (Marketplace §3.4).
 *
 * Mirrors the visit-photo storage pattern: the file arrives as an
 * in-memory buffer (multer), we persist it under <repo>/uploads/marketplace
 * and return a public URL served by express.static at /uploads/*.
 *
 * The returned URL is what the admin then sends as `imageUrl` (services)
 * or `iconUrl` (categories) on the create/update endpoints — keeping
 * those contracts as clean JSON.
 */
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'marketplace');
const PUBLIC_PREFIX = '/uploads/marketplace';

const extFromMime = (mime) => {
  if (mime === 'image/png') {
    return 'png';
  }
  if (mime === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
};

const uploadImage = async (file) => {
  if (!file) {
    throw ApiError.badRequest('No image file provided (field name: "image")');
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const ext = extFromMime(file.mimetype);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);

  const url = `${PUBLIC_PREFIX}/${filename}`;
  logger.info(
    { filename, sizeBytes: file.size, mimeType: file.mimetype },
    'Dashboard image uploaded',
  );

  return { url, sizeBytes: file.size, mimeType: file.mimetype };
};

module.exports = { uploadImage };

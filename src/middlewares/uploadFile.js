const multer = require('multer');
const { ApiError } = require('../utils/ApiError');

/**
 * In-memory multer storage for file uploads. We never write to local
 * disk — the service layer either parses the buffer (Excel) or hands
 * it off to a storage backend later (Cloudinary for visit photos).
 *
 * Per-route config: limit size and accepted mime types via the wrapper
 * factory so each module declares its own contract.
 */

const memoryStorage = multer.memoryStorage();

const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers/curl send this
]);

/**
 * Excel single-file uploader. Reject anything bigger than 5MB or
 * obviously non-spreadsheet on mime sniffing.
 */
const excelUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EXCEL_MIMES.has(file.mimetype) && !file.originalname.match(/\.xlsx?$/i)) {
      return cb(new ApiError(400, 'Only .xlsx / .xls files are accepted'));
    }
    cb(null, true);
  },
}).single('file');

/**
 * Wraps the multer middleware so its errors flow through the global
 * errorHandler instead of crashing the request.
 */
const wrap = (mw) => (req, res, next) =>
  mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('File too large (max 5MB)'));
    }
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });

const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Visit-photo uploader (FRD §1.2.3.1 §2.3). Up to 4 images per request,
 * 5MB each. The service layer is responsible for persisting the buffers
 * and clamping the cumulative count per visit instance.
 */
const visitPhotoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (!PHOTO_MIMES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Only JPEG, PNG, or WebP images are accepted'));
    }
    cb(null, true);
  },
}).array('photos', 4);

/**
 * Single-image uploader for dashboard assets (service / category images,
 * Marketplace §3.4). Same mime/size policy as visit photos but a single
 * file under the `image` field. The service layer persists the buffer
 * and returns a public URL.
 */
const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!PHOTO_MIMES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Only JPEG, PNG, or WebP images are accepted'));
    }
    cb(null, true);
  },
}).single('image');

module.exports = {
  excelUpload: wrap(excelUpload),
  visitPhotoUpload: wrap(visitPhotoUpload),
  imageUpload: wrap(imageUpload),
};

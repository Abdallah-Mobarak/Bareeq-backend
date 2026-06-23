const { Router } = require('express');

const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const { marketplacePhotosUpload } = require('../../middlewares/uploadFile');
const controller = require('./customer-uploads.controller');

const router = Router();

router.use(requireAuth, requireRole('CUSTOMER'));

/**
 * Customer booking-photo upload (Marketplace §1.3).
 *
 * multipart/form-data, up to 4 files under the `files` field
 * (JPEG / PNG / WebP, max 5MB each). Returns relative public URLs to send
 * back as `photoUrls` on POST /customer/bookings.
 */
router.post('/', marketplacePhotosUpload, controller.upload);

module.exports = router;

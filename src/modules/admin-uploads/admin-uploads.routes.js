const { Router } = require('express');

const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const { imageUpload } = require('../../middlewares/uploadFile');
const controller = require('./admin-uploads.controller');

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'MARKETPLACE_ADMIN'));

/**
 * Generic image upload for the marketplace dashboard (Marketplace §3.4).
 *
 * multipart/form-data, single file under the `image` field
 * (JPEG / PNG / WebP, max 5MB). Returns the public URL to send back as
 * `imageUrl` / `iconUrl` on the service / category endpoints.
 */
router.post('/', imageUpload, controller.upload);

module.exports = router;

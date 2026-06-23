const { Router } = require('express');

const controller = require('./locations.controller');

const router = Router();

/**
 * Public location lookups — Region / City dropdowns for signup and other
 * unauthenticated screens. No auth: this is reference data, safe to read.
 * Mounted at /locations in src/routes/index.js.
 *
 *   GET /locations/regions              -> { success, data: { items } }
 *   GET /locations/cities[?regionId=]   -> { success, data: { items } }
 */

router.get('/regions', controller.listRegions);
router.get('/cities', controller.listCities);

module.exports = router;

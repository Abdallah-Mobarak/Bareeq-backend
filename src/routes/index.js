const { Router } = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const managersRoutes = require('../modules/managers/managers.routes');
const supervisorsRoutes = require('../modules/supervisors/supervisors.routes');
const companiesRoutes = require('../modules/companies/companies.routes');
const regionsRoutes = require('../modules/regions/regions.routes');
const citiesRoutes = require('../modules/cities/cities.routes');
const reasonsRoutes = require('../modules/reasons/reasons.routes');
const categoriesRoutes = require('../modules/categories/categories.routes');
const branchesRoutes = require('../modules/branches/branches.routes');

const router = Router();

/**
 * Root API router.
 *
 * Mount each domain module here as we build it. Keep this file free of
 * business logic — it's just a table of contents.
 */

router.use('/auth', authRoutes);
router.use('/managers', managersRoutes);
router.use('/supervisors', supervisorsRoutes);
router.use('/companies', companiesRoutes);
router.use('/regions', regionsRoutes);
router.use('/cities', citiesRoutes);
router.use('/reasons', reasonsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/branches', branchesRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'Bareeq API',
    version: '0.1.0',
    phase: 'Phase 3: Companies & Branches',
  });
});

module.exports = router;

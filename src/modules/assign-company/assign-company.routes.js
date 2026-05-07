const { Router } = require('express');

const validate = require('../../middlewares/validate');
const requireAuth = require('../../middlewares/requireAuth');
const requireRole = require('../../middlewares/requireRole');
const controller = require('./assign-company.controller');
const {
  assignCompanySchema,
  availableCompaniesQuerySchema,
  branchesQuerySchema,
} = require('./assign-company.validation');

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

/**
 * Routes are ordered so the static paths win over the implicit "/" POST.
 * FR-32: dropdown source. FR-40: branches under a picked company.
 */
router.get(
  '/available-companies',
  validate(availableCompaniesQuerySchema, 'query'),
  controller.availableCompanies,
);

router.get('/branches', validate(branchesQuerySchema, 'query'), controller.branches);

router.post('/', validate(assignCompanySchema), controller.assign);

module.exports = router;

const { Router } = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const permissionsRoutes = require('../modules/permissions/permissions.routes');
const permissionRolesRoutes = require('../modules/permission-roles/permission-roles.routes');
const managersRoutes = require('../modules/managers/managers.routes');
const supervisorsRoutes = require('../modules/supervisors/supervisors.routes');
const companiesRoutes = require('../modules/companies/companies.routes');
const accountantManagersRoutes = require('../modules/accountant-managers/accountant-managers.routes');
const adminsRoutes = require('../modules/admins/admins.routes');
const managerTasksRoutes = require('../modules/manager-tasks/manager-tasks.routes');
const assignCompanyRoutes = require('../modules/assign-company/assign-company.routes');
const regionsRoutes = require('../modules/regions/regions.routes');
const citiesRoutes = require('../modules/cities/cities.routes');
const reasonsRoutes = require('../modules/reasons/reasons.routes');
const categoriesRoutes = require('../modules/categories/categories.routes');
const branchesRoutes = require('../modules/branches/branches.routes');
const regionSchedulingsRoutes = require('../modules/region-schedulings/region-schedulings.routes');
const monthlySchedulesRoutes = require('../modules/monthly-schedules/monthly-schedules.routes');
const scheduledVisitsRoutes = require('../modules/scheduled-visits/scheduled-visits.routes');
const supervisorScheduleRoutes = require('../modules/supervisor-schedule/supervisor-schedule.routes');
const visitInstancesRoutes = require('../modules/visit-instances/visit-instances.routes');
const {
  supervisorRouter: visitDocSupervisorRoutes,
  publicRouter: visitDocPublicRoutes,
} = require('../modules/visit-documentation/visit-documentation.routes');

const router = Router();

/**
 * Root API router.
 *
 * Mount each domain module here as we build it. Keep this file free of
 * business logic — it's just a table of contents.
 */

router.use('/auth', authRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/permission-roles', permissionRolesRoutes);
router.use('/managers', managersRoutes);
router.use('/supervisors', supervisorsRoutes);
router.use('/companies', companiesRoutes);
router.use('/accountant-managers', accountantManagersRoutes);
router.use('/admins', adminsRoutes);
router.use('/manager-tasks', managerTasksRoutes);
router.use('/assign-company', assignCompanyRoutes);
router.use('/regions', regionsRoutes);
router.use('/cities', citiesRoutes);
router.use('/reasons', reasonsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/branches', branchesRoutes);
router.use('/region-schedulings', regionSchedulingsRoutes);
router.use('/monthly-schedules', monthlySchedulesRoutes);
router.use('/scheduled-visits', scheduledVisitsRoutes);
router.use('/supervisor', supervisorScheduleRoutes);
router.use('/visit-instances', visitInstancesRoutes);
router.use('/visit-instances', visitDocSupervisorRoutes);
router.use('/public/document', visitDocPublicRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'Bareeq API',
    version: '0.1.0',
    phase: 'Phase 4: Scheduling',
  });
});

module.exports = router;

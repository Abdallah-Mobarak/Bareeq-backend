const { Router } = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const customerAuthRoutes = require('../modules/customer-auth/customer-auth.routes');
const serviceProviderAuthRoutes = require('../modules/service-provider-auth/service-provider-auth.routes');
const adminServiceCategoriesRoutes = require('../modules/admin-service-categories/admin-service-categories.routes');
const adminServicesRoutes = require('../modules/admin-services/admin-services.routes');
const customerHomeRoutes = require('../modules/customer-home/customer-home.routes');
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
const supervisorAdditionalTasksRoutes = require('../modules/supervisor-additional-tasks/supervisor-additional-tasks.routes');
const companyPortalRoutes = require('../modules/company-portal/company-portal.routes');
const managerPortalRoutes = require('../modules/manager-portal/manager-portal.routes');
const managerMonthlySalesRoutes = require('../modules/manager-monthly-sales/manager-monthly-sales.routes');
const managerCarCaseRoutes = require('../modules/manager-car-case/manager-car-case.routes');
const managerRepresentativesRoutes = require('../modules/manager-representatives/manager-representatives.routes');
const adminContactMessagesRoutes = require('../modules/admin-contact-messages/admin-contact-messages.routes');
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
router.use('/auth/customer', customerAuthRoutes);
router.use('/auth/service-provider', serviceProviderAuthRoutes);
router.use('/admin/service-categories', adminServiceCategoriesRoutes);
router.use('/admin/services', adminServicesRoutes);
router.use('/customer/home', customerHomeRoutes);
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
router.use('/supervisor/additional-tasks', supervisorAdditionalTasksRoutes);
router.use('/company', companyPortalRoutes);
router.use('/manager', managerPortalRoutes);
router.use('/manager/clients', managerMonthlySalesRoutes);
router.use('/manager/car-cases', managerCarCaseRoutes);
router.use('/manager/representatives', managerRepresentativesRoutes);
router.use('/admin/contact-messages', adminContactMessagesRoutes);
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

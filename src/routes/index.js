const { Router } = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const customerAuthRoutes = require('../modules/customer-auth/customer-auth.routes');
const serviceProviderAuthRoutes = require('../modules/service-provider-auth/service-provider-auth.routes');
const adminServiceCategoriesRoutes = require('../modules/admin-service-categories/admin-service-categories.routes');
const adminServicesRoutes = require('../modules/admin-services/admin-services.routes');
const customerHomeRoutes = require('../modules/customer-home/customer-home.routes');
const customerProfileRoutes = require('../modules/customer-profile/customer-profile.routes');
const customerUploadsRoutes = require('../modules/customer-uploads/customer-uploads.routes');
const customerContactRoutes = require('../modules/customer-contact/customer-contact.routes');
const locationsRoutes = require('../modules/locations/locations.routes');
const serviceProviderProfileRoutes = require('../modules/service-provider-profile/service-provider-profile.routes');
const adminCustomersRoutes = require('../modules/admin-customers/admin-customers.routes');
const adminServiceProvidersRoutes = require('../modules/admin-service-providers/admin-service-providers.routes');
const customerBookingsRoutes = require('../modules/customer-bookings/customer-bookings.routes');
const serviceProviderBookingsRoutes = require('../modules/service-provider-bookings/service-provider-bookings.routes');
const adminBookingsRoutes = require('../modules/admin-bookings/admin-bookings.routes');
const customerReviewsRoutes = require('../modules/customer-reviews/customer-reviews.routes');
const serviceProviderReviewsRoutes = require('../modules/service-provider-reviews/service-provider-reviews.routes');
const adminReviewsRoutes = require('../modules/admin-reviews/admin-reviews.routes');
const notificationsRoutes = require('../modules/notifications/notifications.routes');
const customerWalletRoutes = require('../modules/customer-wallet/customer-wallet.routes');
const serviceProviderWalletRoutes = require('../modules/service-provider-wallet/service-provider-wallet.routes');
const adminWalletsRoutes = require('../modules/admin-wallets/admin-wallets.routes');
const serviceProviderWithdrawalsRoutes = require('../modules/service-provider-withdrawals/service-provider-withdrawals.routes');
const adminWithdrawalsRoutes = require('../modules/admin-withdrawals/admin-withdrawals.routes');
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
const adminServiceTypesRoutes = require('../modules/admin-service-types/admin-service-types.routes');
const managerServiceTypesRoutes = require('../modules/manager-service-types/manager-service-types.routes');
const adminContactMessagesRoutes = require('../modules/admin-contact-messages/admin-contact-messages.routes');
const adminMonthlyReportsRoutes = require('../modules/admin-monthly-reports/admin-monthly-reports.routes');
const adminBroadcastsRoutes = require('../modules/admin-broadcasts/admin-broadcasts.routes');
const customerDisputesRoutes = require('../modules/customer-disputes/customer-disputes.routes');
const serviceProviderDisputesRoutes = require('../modules/service-provider-disputes/service-provider-disputes.routes');
const adminDisputesRoutes = require('../modules/admin-disputes/admin-disputes.routes');
const adminSystemSettingsRoutes = require('../modules/admin-system-settings/admin-system-settings.routes');
const systemSettingsRoutes = require('../modules/system-settings/system-settings.routes');
const adminLookupsRoutes = require('../modules/admin-lookups/admin-lookups.routes');
const adminUploadsRoutes = require('../modules/admin-uploads/admin-uploads.routes');
const adminFinancialRoutes = require('../modules/admin-financial/admin-financial.routes');
const adminUsersRoutes = require('../modules/admin-users/admin-users.routes');
const visitInstancesRoutes = require('../modules/visit-instances/visit-instances.routes');
const {
  supervisorRouter: visitDocSupervisorRoutes,
  publicRouter: visitDocPublicRoutes,
} = require('../modules/visit-documentation/visit-documentation.routes');
const {
  supervisorRouter: additionalTaskDocSupervisorRoutes,
  publicRouter: additionalTaskDocPublicRoutes,
} = require('../modules/additional-task-documentation/additional-task-documentation.routes');

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
router.use('/customer/profile', customerProfileRoutes);
router.use('/customer/uploads', customerUploadsRoutes);
router.use('/customer/contact', customerContactRoutes);
router.use('/service-provider/profile', serviceProviderProfileRoutes);
router.use('/admin/customers', adminCustomersRoutes);
router.use('/admin/service-providers', adminServiceProvidersRoutes);
router.use('/customer/bookings', customerBookingsRoutes);
router.use('/service-provider/bookings', serviceProviderBookingsRoutes);
router.use('/admin/bookings', adminBookingsRoutes);
router.use('/customer/bookings/:id/review', customerReviewsRoutes);
router.use('/service-provider/reviews', serviceProviderReviewsRoutes);
router.use('/admin/reviews', adminReviewsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/customer/wallet', customerWalletRoutes);
router.use('/service-provider/wallet', serviceProviderWalletRoutes);
router.use('/admin/wallets', adminWalletsRoutes);
router.use('/service-provider/withdrawals', serviceProviderWithdrawalsRoutes);
router.use('/admin/withdrawals', adminWithdrawalsRoutes);
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
router.use('/supervisor/additional-tasks', additionalTaskDocSupervisorRoutes);
router.use('/company', companyPortalRoutes);
router.use('/manager', managerPortalRoutes);
router.use('/manager/clients', managerMonthlySalesRoutes);
router.use('/manager/car-cases', managerCarCaseRoutes);
router.use('/manager/representatives', managerRepresentativesRoutes);
router.use('/admin/service-types', adminServiceTypesRoutes);
router.use('/manager/service-types', managerServiceTypesRoutes);
router.use('/admin/contact-messages', adminContactMessagesRoutes);
router.use('/admin/monthly-reports', adminMonthlyReportsRoutes);
router.use('/admin/broadcasts', adminBroadcastsRoutes);
router.use('/customer/disputes', customerDisputesRoutes);
router.use('/service-provider/disputes', serviceProviderDisputesRoutes);
router.use('/admin/disputes', adminDisputesRoutes);
router.use('/admin/system-settings', adminSystemSettingsRoutes);
router.use('/settings', systemSettingsRoutes);
router.use('/locations', locationsRoutes);
router.use('/admin/lookups', adminLookupsRoutes);
router.use('/admin/uploads', adminUploadsRoutes);
router.use('/admin/financial', adminFinancialRoutes);
router.use('/admin/users', adminUsersRoutes);
router.use('/visit-instances', visitInstancesRoutes);
router.use('/visit-instances', visitDocSupervisorRoutes);
router.use('/public/document', visitDocPublicRoutes);
router.use('/public/additional-task-document', additionalTaskDocPublicRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'Bareeq API',
    version: '0.1.0',
    phase: 'Phase 4: Scheduling',
  });
});

module.exports = router;

/* eslint-disable no-console */
/**
 * Reset script — يمسح البيانات القديمة بتاعة COMPANY_USER + AM + Companies
 * + Region Schedulings عشان نقدر نختبر السايكل كاملة من الصفر.
 *
 * مش بيمس الـ Admin — بس بيمسح الـ tenant data.
 */

const { prisma } = require('../src/infrastructure/database/prisma');

const main = async () => {
  console.log('--- Resetting tenant data ---');

  const amBranches = await prisma.accountantManagerRegionScheduling.deleteMany({});
  console.log(`Deleted ${amBranches.count} AM-branch links`);

  const refresh = await prisma.refreshToken.deleteMany({
    where: {
      user: { role: { in: ['COMPANY_USER', 'ACCOUNTANT_MANAGER'] } },
    },
  });
  console.log(`Deleted ${refresh.count} refresh tokens`);

  const users = await prisma.user.deleteMany({
    where: { role: { in: ['COMPANY_USER', 'ACCOUNTANT_MANAGER'] } },
  });
  console.log(`Deleted ${users.count} users (COMPANY_USER + AM)`);

  const companies = await prisma.company.deleteMany({});
  console.log(`Deleted ${companies.count} companies`);

  // Anything that references region_schedulings must die first.
  const visits = await prisma.scheduledVisit.deleteMany({});
  console.log(`Deleted ${visits.count} scheduled visits`);

  const schedules = await prisma.monthlySchedule.deleteMany({});
  console.log(`Deleted ${schedules.count} monthly schedules`);

  const tasks = await prisma.regionSchedulingTask.deleteMany({});
  console.log(`Deleted ${tasks.count} region scheduling tasks`);

  const rs = await prisma.regionScheduling.deleteMany({});
  console.log(`Deleted ${rs.count} region schedulings`);

  console.log('\n✅ Done. Now you have a clean slate.');
  console.log('   Admin user is preserved. Login and start fresh.');

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

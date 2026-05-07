/* eslint-disable no-console */
/**
 * Debug helper — تشخيص ليه /assign-company/available-companies بترجع []
 * يعرض:
 *   - عدد الـ region_schedulings الموجودين
 *   - الـ DISTINCT companyName اللي فيهم
 *   - الـ companies اللي عندها COMPANY_USER (يعني اتعمل assign قبل كده)
 */

const { prisma } = require('../src/infrastructure/database/prisma');

const main = async () => {
  console.log('--- 1. region_schedulings ---');
  const rsCount = await prisma.regionScheduling.count({ where: { deletedAt: null } });
  console.log(`Total active region_schedulings: ${rsCount}`);

  if (rsCount > 0) {
    const distinct = await prisma.regionScheduling.groupBy({
      by: ['companyName'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    console.log('\nDistinct companyName values:');
    distinct.forEach((d) => {
      console.log(`  "${d.companyName}"  (${d._count._all} branches)`);
    });
  } else {
    console.log('\n>>> الـ region_schedulings فاضية. ده السبب إن الـ dropdown راجع [].');
    console.log('    هتحتاج تعمل POST /region-schedulings الأول.');
  }

  console.log('\n--- 2. companies (already assigned) ---');
  const taken = await prisma.company.findMany({
    where: {
      deletedAt: null,
      loginUsers: {
        some: { role: 'COMPANY_USER', deletedAt: null },
      },
    },
    select: {
      id: true,
      nameAr: true,
      loginUsers: {
        where: { role: 'COMPANY_USER', deletedAt: null },
        select: { email: true },
      },
    },
  });
  if (taken.length === 0) {
    console.log('No assigned companies yet.');
  } else {
    console.log('Assigned companies (these are HIDDEN from the dropdown):');
    taken.forEach((c) => {
      console.log(`  "${c.nameAr}"  (login: ${c.loginUsers[0]?.email})`);
    });
  }

  console.log('\n--- 3. all companies in DB ---');
  const all = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      nameAr: true,
      _count: { select: { loginUsers: { where: { deletedAt: null } } } },
    },
  });
  if (all.length === 0) {
    console.log('No companies in DB at all.');
  } else {
    all.forEach((c) => {
      console.log(`  "${c.nameAr}"  (login users: ${c._count.loginUsers})`);
    });
  }

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

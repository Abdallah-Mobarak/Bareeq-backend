const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

(async () => {
  const sp = await p.serviceProvider.findFirst({
    where: { user: { email: 'provider1@test.com' } },
    include: {
      user: { select: { email: true, role: true, nameAr: true, nameEn: true } },
    },
  });
  console.log(JSON.stringify(sp, null, 2));
  await p.$disconnect();
})();

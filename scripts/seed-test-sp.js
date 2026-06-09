/**
 * Seed a ready-to-use Service Provider TEST account (+ pool data) so the
 * mobile developer can log in and exercise every SP screen immediately.
 *
 * Creates / refreshes (idempotent — safe to re-run):
 *   - a service category ("نوع الخدمة") + a service with subcategories
 *   - the SP user: ENABLED + KYC APPROVED + linked to that category
 *   - a customer who posts requests into the SP's pool
 *   - 3 PENDING requests (Home pool) + 1 APPROVED request (Approved tab)
 *
 * Run:  node scripts/seed-test-sp.js
 */
const { prisma } = require('../src/infrastructure/database/prisma');
const password = require('../src/utils/password');

const SP_EMAIL = 'sp-test@bareeq.local';
const SP_PASSWORD = 'Test@12345';
const CUSTOMER_EMAIL = 'customer-test@bareeq.local';

const upsertUser = async (email, data) => {
  const passwordHash = await password.hash(data.password);
  return prisma.user.upsert({
    where: { email },
    update: {
      password: passwordHash,
      status: data.status,
      deletedAt: null,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      phone: data.phone,
    },
    create: {
      email,
      password: passwordHash,
      role: data.role,
      status: data.status,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      phone: data.phone,
    },
  });
};

const main = async () => {
  // 1) Category ("Service Type") the SP registers for.
  let category = await prisma.serviceCategory.findFirst({
    where: { titleEn: 'Air Conditioning', deletedAt: null },
  });
  if (!category) {
    category = await prisma.serviceCategory.create({
      data: { titleAr: 'تكييف', titleEn: 'Air Conditioning', isActive: true },
    });
  }

  // 2) A service under that category, with subcategories.
  let service = await prisma.service.findFirst({
    where: { titleEn: 'Air Conditioner Fix', categoryId: category.id, deletedAt: null },
    include: { subcategories: { where: { deletedAt: null } } },
  });
  if (!service) {
    service = await prisma.service.create({
      data: {
        categoryId: category.id,
        titleAr: 'إصلاح المكيف',
        titleEn: 'Air Conditioner Fix',
        descriptionAr: 'فحص شامل وإصلاح أعطال التكييف.',
        descriptionEn: 'Full inspection and AC repair.',
        commissionRate: 10,
        isActive: true,
        subcategories: {
          create: [
            { titleAr: 'فحص', titleEn: 'Inspection', cost: 99 },
            { titleAr: 'إصلاح', titleEn: 'Repair', cost: 150 },
          ],
        },
      },
      include: { subcategories: { where: { deletedAt: null } } },
    });
  }
  const subs = service.subcategories;
  const totalCost = subs.reduce((a, s) => a + Number(s.cost), 0).toFixed(2);

  // 3) The SP user — ENABLED + KYC APPROVED + category linked.
  const spUser = await upsertUser(SP_EMAIL, {
    password: SP_PASSWORD,
    role: 'SERVICE_PROVIDER',
    status: 'ENABLED',
    nameAr: 'مزود تجريبي',
    nameEn: 'Test Provider',
    phone: '0500000001',
  });
  await prisma.serviceProvider.upsert({
    where: { userId: spUser.id },
    update: {
      deletedAt: null,
      isVerified: true,
      kycStatus: 'APPROVED',
      verifiedAt: new Date(),
      serviceCategoryId: category.id,
    },
    create: {
      userId: spUser.id,
      isVerified: true,
      kycStatus: 'APPROVED',
      verifiedAt: new Date(),
      serviceCategoryId: category.id,
      bio: 'حساب تجريبي للاختبار.',
    },
  });

  // 4) A customer to post requests.
  const custUser = await upsertUser(CUSTOMER_EMAIL, {
    password: SP_PASSWORD,
    role: 'CUSTOMER',
    status: 'ENABLED',
    nameAr: 'عميل تجريبي',
    nameEn: 'Test Customer',
    phone: '0500000002',
  });
  await prisma.customer.upsert({
    where: { userId: custUser.id },
    update: { deletedAt: null },
    create: { userId: custUser.id },
  });

  // 5) Fresh bookings — wipe this customer's old ones so re-runs stay clean.
  await prisma.bookingSubcategory.deleteMany({
    where: { booking: { customerId: custUser.id } },
  });
  await prisma.booking.deleteMany({ where: { customerId: custUser.id } });

  const makeBooking = async ({ approved }) => {
    const booking = await prisma.booking.create({
      data: {
        customerId: custUser.id,
        serviceId: service.id,
        description: 'إصلاح عطل التبريد + صيانة.',
        locationAddress: 'الرياض — حي الصحافة',
        locationLat: 24.7136,
        locationLng: 46.6753,
        scheduledDate: new Date(Date.now() + 2 * 86400000),
        totalCost,
        paymentMethod: 'CASH',
        ...(approved && {
          assignedSpId: spUser.id,
          status: 'APPROVED',
          approvedAt: new Date(),
          commissionRate: 10,
          commissionAmount: ((Number(totalCost) * 10) / 100).toFixed(2),
        }),
        selectedSubcategories: {
          create: subs.map((s) => ({
            subcategoryId: s.id,
            titleAr: s.titleAr,
            titleEn: s.titleEn,
            cost: s.cost,
          })),
        },
      },
    });
    return booking.id;
  };

  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await makeBooking({ approved: false }); // pool / Home
  }
  await makeBooking({ approved: true }); // Approved tab

  console.log('\n✓ Service Provider test account ready:\n');
  console.log('  email   :', SP_EMAIL);
  console.log('  password:', SP_PASSWORD);
  console.log('  login   : POST /api/v1/auth/mobile/login');
  console.log('  status  : ENABLED + KYC APPROVED');
  console.log('  type    :', `${category.titleEn} (${category.titleAr})`);
  console.log('  pool    : 3 PENDING requests + 1 APPROVED, service-cost', totalCost, 'SAR each');
  console.log('\n  (customer that posts requests:', CUSTOMER_EMAIL, '/', SP_PASSWORD, ')\n');
};

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

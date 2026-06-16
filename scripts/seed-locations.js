/**
 * Seed the Region / City catalog with Saudi Arabia's 13 administrative
 * regions and their main cities — the data the signup / branch screens
 * read to populate the Region → City dropdowns.
 *
 * Why a script (not the admin panel)?
 *   These rows used to be entered by hand via POST /regions + /cities.
 *   That's slow and easy to forget on a fresh environment, so this makes
 *   it one reproducible command for every new server / DB reset.
 *
 * Idempotent: re-running does NOT create duplicates. Regions are keyed by
 * nameEn; cities by (regionId, nameEn). Existing rows are reused.
 *
 * Usage:
 *   node scripts/seed-locations.js
 *   npm run seed:locations
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * 13 official administrative regions of Saudi Arabia, each with its main
 * cities. nameAr is the canonical display name; nameEn is the transliteration.
 */
const REGIONS = [
  {
    nameAr: 'الرياض',
    nameEn: 'Riyadh',
    cities: [
      { nameAr: 'الرياض', nameEn: 'Riyadh' },
      { nameAr: 'الدرعية', nameEn: 'Diriyah' },
      { nameAr: 'الخرج', nameEn: 'Al Kharj' },
      { nameAr: 'المجمعة', nameEn: 'Al Majmaah' },
      { nameAr: 'الدوادمي', nameEn: 'Ad Dawadimi' },
    ],
  },
  {
    nameAr: 'مكة المكرمة',
    nameEn: 'Makkah',
    cities: [
      { nameAr: 'مكة المكرمة', nameEn: 'Mecca' },
      { nameAr: 'جدة', nameEn: 'Jeddah' },
      { nameAr: 'الطائف', nameEn: 'Taif' },
      { nameAr: 'رابغ', nameEn: 'Rabigh' },
    ],
  },
  {
    nameAr: 'المدينة المنورة',
    nameEn: 'Madinah',
    cities: [
      { nameAr: 'المدينة المنورة', nameEn: 'Medina' },
      { nameAr: 'ينبع', nameEn: 'Yanbu' },
      { nameAr: 'العلا', nameEn: 'AlUla' },
    ],
  },
  {
    nameAr: 'القصيم',
    nameEn: 'Qassim',
    cities: [
      { nameAr: 'بريدة', nameEn: 'Buraidah' },
      { nameAr: 'عنيزة', nameEn: 'Unaizah' },
      { nameAr: 'الرس', nameEn: 'Ar Rass' },
    ],
  },
  {
    nameAr: 'المنطقة الشرقية',
    nameEn: 'Eastern Province',
    cities: [
      { nameAr: 'الدمام', nameEn: 'Dammam' },
      { nameAr: 'الخبر', nameEn: 'Khobar' },
      { nameAr: 'الظهران', nameEn: 'Dhahran' },
      { nameAr: 'الأحساء', nameEn: 'Al Ahsa' },
      { nameAr: 'الجبيل', nameEn: 'Jubail' },
      { nameAr: 'القطيف', nameEn: 'Qatif' },
    ],
  },
  {
    nameAr: 'عسير',
    nameEn: 'Asir',
    cities: [
      { nameAr: 'أبها', nameEn: 'Abha' },
      { nameAr: 'خميس مشيط', nameEn: 'Khamis Mushait' },
    ],
  },
  {
    nameAr: 'تبوك',
    nameEn: 'Tabuk',
    cities: [{ nameAr: 'تبوك', nameEn: 'Tabuk' }],
  },
  {
    nameAr: 'حائل',
    nameEn: 'Hail',
    cities: [{ nameAr: 'حائل', nameEn: 'Hail' }],
  },
  {
    nameAr: 'الحدود الشمالية',
    nameEn: 'Northern Borders',
    cities: [
      { nameAr: 'عرعر', nameEn: 'Arar' },
      { nameAr: 'رفحاء', nameEn: 'Rafha' },
    ],
  },
  {
    nameAr: 'جازان',
    nameEn: 'Jazan',
    cities: [{ nameAr: 'جازان', nameEn: 'Jazan' }],
  },
  {
    nameAr: 'نجران',
    nameEn: 'Najran',
    cities: [{ nameAr: 'نجران', nameEn: 'Najran' }],
  },
  {
    nameAr: 'الباحة',
    nameEn: 'Al Bahah',
    cities: [{ nameAr: 'الباحة', nameEn: 'Al Bahah' }],
  },
  {
    nameAr: 'الجوف',
    nameEn: 'Al Jawf',
    cities: [
      { nameAr: 'سكاكا', nameEn: 'Sakaka' },
      { nameAr: 'القريات', nameEn: 'Qurayyat' },
    ],
  },
];

/** Find an active region by nameEn, or create it. */
const ensureRegion = async ({ nameAr, nameEn }) => {
  const existing = await prisma.region.findFirst({
    where: { nameEn, deletedAt: null },
  });
  if (existing) return { row: existing, created: false };

  const row = await prisma.region.create({ data: { nameAr, nameEn } });
  return { row, created: true };
};

/** Find an active city by (regionId, nameEn), or create it. */
const ensureCity = async (regionId, { nameAr, nameEn }) => {
  const existing = await prisma.city.findFirst({
    where: { regionId, nameEn, deletedAt: null },
  });
  if (existing) return false;

  await prisma.city.create({ data: { regionId, nameAr, nameEn } });
  return true;
};

const main = async () => {
  console.log('Seeding Saudi regions + cities...');

  let regionsCreated = 0;
  let citiesCreated = 0;

  for (const r of REGIONS) {
    const { row: region, created } = await ensureRegion(r);
    if (created) regionsCreated += 1;

    for (const c of r.cities) {
      if (await ensureCity(region.id, c)) citiesCreated += 1;
    }
  }

  console.log('---');
  console.log(`Regions: ${regionsCreated} new (${REGIONS.length} total in seed)`);
  console.log(`Cities:  ${citiesCreated} new`);
  console.log('---');
  console.log('Done. GET /api/v1/locations/regions should now return the list.');
};

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Seed the ServiceCategory catalog — the "Service Types" the Service
 * Provider picks during signup (FRD §2.1: "Service Type, managed by admin")
 * and that the marketplace home reads to group services.
 *
 * Why a script (not the admin panel)?
 *   On a fresh server the table is empty, so GET /auth/service-provider/
 *   service-types returns []. The admin can add types from the dashboard
 *   (POST /api/v1/admin/service-categories), but that's slow and easy to
 *   forget on every new environment — this makes it one reproducible command.
 *
 * Idempotent: re-running does NOT create duplicates. Rows are keyed by
 * titleAr; existing rows are reused (and NOT overwritten, so admin edits
 * made in the dashboard survive a re-seed).
 *
 * Usage:
 *   node scripts/seed-categories.js
 *   npm run seed:categories
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Initial service types for the marketplace. sortOrder controls the order
 * in the dropdown / home; iconUrl is left null for the admin to fill later.
 * Edit / extend this list freely — re-seeding only adds what's missing.
 */
const CATEGORIES = [
  { titleAr: 'سباكة', titleEn: 'Plumbing' },
  { titleAr: 'كهرباء', titleEn: 'Electrical' },
  { titleAr: 'تكييف وتبريد', titleEn: 'Air Conditioning & Cooling' },
  { titleAr: 'نظافة', titleEn: 'Cleaning' },
  { titleAr: 'نجارة', titleEn: 'Carpentry' },
  { titleAr: 'دهانات', titleEn: 'Painting' },
  { titleAr: 'صيانة أجهزة منزلية', titleEn: 'Home Appliance Repair' },
  { titleAr: 'مكافحة حشرات', titleEn: 'Pest Control' },
  { titleAr: 'نقل عفش', titleEn: 'Furniture Moving' },
  { titleAr: 'تنسيق حدائق', titleEn: 'Landscaping & Gardening' },
  { titleAr: 'ألمنيوم وزجاج', titleEn: 'Aluminum & Glass' },
  { titleAr: 'سيراميك وبلاط', titleEn: 'Tiling & Ceramics' },
  { titleAr: 'عزل مائي وحراري', titleEn: 'Waterproofing & Insulation' },
  { titleAr: 'كاميرات مراقبة', titleEn: 'CCTV & Security' },
  { titleAr: 'صيانة عامة', titleEn: 'General Maintenance' },
];

/** Find an active category by titleAr, or create it with its sort order. */
const ensureCategory = async ({ titleAr, titleEn }, sortOrder) => {
  const existing = await prisma.serviceCategory.findFirst({
    where: { titleAr, deletedAt: null },
  });
  if (existing) return false;

  await prisma.serviceCategory.create({
    data: { titleAr, titleEn, sortOrder, isActive: true },
  });
  return true;
};

const main = async () => {
  console.log('Seeding service categories (Service Types)...');

  let created = 0;
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    // sortOrder = index * 10 leaves gaps so the admin can reorder later.
    if (await ensureCategory(CATEGORIES[i], i * 10)) created += 1;
  }

  console.log('---');
  console.log(`Categories: ${created} new (${CATEGORIES.length} total in seed)`);
  console.log('---');
  console.log('Done. GET /api/v1/auth/service-provider/service-types should now return the list.');
};

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

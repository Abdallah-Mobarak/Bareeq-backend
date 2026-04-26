/**
 * Idempotent seed: create (or refresh) the bootstrap admin user.
 * Safe to run multiple times — uses upsert.
 *
 * Usage:
 *   npm run seed:admin
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@bareeq.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

const main = async () => {
  console.log(`Seeding bootstrap admin: ${ADMIN_EMAIL}`);

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Refresh password on every seed run so we always know how to log in
      password: passwordHash,
      status: 'ENABLED',
    },
    create: {
      email: ADMIN_EMAIL,
      password: passwordHash,
      role: 'ADMIN',
      status: 'ENABLED',
      nameAr: 'المسؤول الرئيسي',
      nameEn: 'Root Admin',
    },
  });

  console.log('---');
  console.log('Admin ready.');
  console.log(`  id:       ${admin.id}`);
  console.log(`  email:    ${admin.email}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log('---');
  console.log('CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION.');
};

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

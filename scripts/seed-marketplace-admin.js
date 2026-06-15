/**
 * Idempotent seed: create (or refresh) a Marketplace Admin account.
 *
 * MARKETPLACE_ADMIN is a dedicated SystemRole (Marketplace §3) that is
 * isolated from the Management System — it only passes requireRole on
 * the marketplace admin modules, never on the Management System's
 * ADMIN-gated routes. Use this account to test the marketplace
 * dashboard without touching the field-visit admin.
 *
 * Safe to run multiple times — uses upsert.
 *
 * Usage:
 *   npm run seed:marketplace-admin
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const EMAIL = process.env.SEED_MARKETPLACE_ADMIN_EMAIL || 'marketplace-admin@bareeq.local';
const PASSWORD = process.env.SEED_MARKETPLACE_ADMIN_PASSWORD || 'Market@12345';

const main = async () => {
  console.log(`Seeding marketplace admin: ${EMAIL}`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      // Refresh password on every seed run so we always know how to log in
      password: passwordHash,
      role: 'MARKETPLACE_ADMIN',
      status: 'ENABLED',
    },
    create: {
      email: EMAIL,
      password: passwordHash,
      role: 'MARKETPLACE_ADMIN',
      status: 'ENABLED',
      nameAr: 'مسؤول السوق',
      nameEn: 'Marketplace Admin',
    },
  });

  console.log('---');
  console.log('Marketplace admin ready.');
  console.log(`  id:       ${admin.id}`);
  console.log(`  email:    ${admin.email}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  role:     ${admin.role}`);
  console.log('---');
  console.log('Log in via POST /api/v1/auth/web/login');
  console.log('CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION.');
};

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

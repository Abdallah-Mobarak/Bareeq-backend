/**
 * Dev-only — reset a user's password to a known value so we can
 * exercise their account in smoke tests.
 *
 * Usage:
 *   node scripts/debug-reset-user-password.js <email> [newPassword]
 *
 * If no password is supplied, defaults to "Reset@12345". Refuses
 * to run if NODE_ENV === 'production'.
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production.');
  process.exit(1);
}

const email = process.argv[2];
const newPassword = process.argv[3] || 'Reset@12345';

if (!email) {
  console.error('Usage: node scripts/debug-reset-user-password.js <email> [newPassword]');
  process.exit(1);
}

const prisma = new PrismaClient();

(async () => {
  const hash = await bcrypt.hash(newPassword, 10);
  try {
    const updated = await prisma.user.update({
      where: { email },
      data: { password: hash },
      select: { id: true, email: true, role: true, status: true },
    });
    console.log(`✓ Reset password for ${updated.email} (role: ${updated.role}, status: ${updated.status})`);
    console.log(`  New password: ${newPassword}`);
  } catch (e) {
    if (e.code === 'P2025') {
      console.error(`✗ No user found with email: ${email}`);
    } else {
      console.error('Unexpected error:', e);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

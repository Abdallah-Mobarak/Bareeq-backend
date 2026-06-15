const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Type-ahead user lookup for the broadcast picker. Returns a small, flat
 * list (no pagination) — it's meant to back an autocomplete, not a table.
 */
const MARKETPLACE_ROLES = ['CUSTOMER', 'SERVICE_PROVIDER'];

const lookup = async ({ q, role, limit }) => {
  const rows = await prisma.user.findMany({
    where: {
      role: role ? role : { in: MARKETPLACE_ROLES },
      deletedAt: null,
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      email: true,
      phone: true,
      role: true,
    },
  });

  return { items: rows };
};

module.exports = { lookup };

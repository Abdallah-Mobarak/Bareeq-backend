const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Manager-facing read of the admin-managed ServiceType catalog —
 * FRD §3.10. Used to populate the dropdown when the manager creates
 * or edits a Representative agreement.
 *
 * No pagination: the catalog is small (admin-curated, ~tens of rows
 * tops), and the FE needs the whole list at once to render the
 * dropdown. If this list ever grows past a few hundred we'll revisit.
 */

const serializeServiceType = (st) => ({
  id: st.id,
  nameAr: st.nameAr,
  nameEn: st.nameEn,
  hourlyRate: st.hourlyRate ? Number(st.hourlyRate) : 0,
});

const listServiceTypes = async () => {
  const items = await prisma.serviceType.findMany({
    where: { deletedAt: null },
    orderBy: { nameAr: 'asc' },
  });
  return items.map(serializeServiceType);
};

module.exports = { listServiceTypes };

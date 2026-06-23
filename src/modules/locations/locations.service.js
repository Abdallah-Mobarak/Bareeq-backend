const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Public, read-only view of the Region / City catalog for signup and
 * other unauthenticated screens (the mobile apps populate their
 * Region → City dropdowns from here).
 *
 * Why separate from the admin /regions + /cities modules?
 *   Those are admin-only CRUD (requireRole('ADMIN')). The signup screen
 *   is public, so it needs a read-only endpoint with no auth and no
 *   pagination — just the full active list. Same tables, different door.
 */

const serializeRegion = (r) => ({
  id: r.id,
  nameAr: r.nameAr,
  nameEn: r.nameEn,
});

const serializeCity = (c) => ({
  id: c.id,
  regionId: c.regionId,
  nameAr: c.nameAr,
  nameEn: c.nameEn,
});

/** All active regions, alphabetical by Arabic name. */
const listRegions = async () => {
  const regions = await prisma.region.findMany({
    where: { deletedAt: null },
    orderBy: { nameAr: 'asc' },
  });
  return { items: regions.map(serializeRegion) };
};

/** All active cities, optionally filtered to one region. */
const listCities = async ({ regionId } = {}) => {
  const cities = await prisma.city.findMany({
    where: { deletedAt: null, ...(regionId && { regionId }) },
    orderBy: { nameAr: 'asc' },
  });
  return { items: cities.map(serializeCity) };
};

module.exports = { listRegions, listCities };

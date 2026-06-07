const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

/**
 * Admin Lookups — FRD §4.9.2 + §4.10.2.
 *
 * One table, six discriminated dropdowns. Soft-deleted (deletedAt)
 * so consumers (Client.contractTypeId, CarCase.areaId, etc.) keep
 * pointing at the row for historical accuracy. Postgres-level
 * ON DELETE behaviour matches: SET NULL for Client (rate-of-record
 * snapshot), RESTRICT for CarCase (the row must remain reachable).
 *
 * The `type` field is set at creation and never changed afterwards —
 * see updateLookup() for why.
 */

const serialize = (l) => ({
  id: l.id,
  type: l.type,
  titleAr: l.titleAr,
  titleEn: l.titleEn,
  sortOrder: l.sortOrder,
  // TAX_TYPE only; null for every other type.
  percentage: l.percentage,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

/**
 * Look up a row by id and assert the caller expected its type.
 * Used by consumer modules (manager-monthly-sales, manager-car-case)
 * to validate an FK input belongs to the correct dropdown — exported
 * so they share one source of truth rather than copying the query.
 */
const loadActiveByType = async (id, expectedType) => {
  const row = await prisma.lookup.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw ApiError.badRequest(`Lookup ${id} not found`);
  if (row.type !== expectedType) {
    throw ApiError.badRequest(
      `Lookup ${id} has type ${row.type}, expected ${expectedType}`,
    );
  }
  return row;
};

const createLookup = async ({ type, titleAr, titleEn, sortOrder, percentage }) => {
  const row = await prisma.lookup.create({
    data: {
      type,
      titleAr,
      titleEn: titleEn || null,
      sortOrder: sortOrder ?? 0,
      // Validation already guarantees percentage is present iff TAX_TYPE.
      percentage: percentage ?? null,
    },
  });
  logger.info({ lookupId: row.id, type }, 'Lookup created');
  return serialize(row);
};

const listLookups = async ({ page, limit, type, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(type && { type }),
    ...(q && {
      OR: [
        { titleAr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  let orderBy;
  if (sort === 'newest') orderBy = { createdAt: 'desc' };
  else if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'name') orderBy = { titleAr: 'asc' };
  else orderBy = [{ sortOrder: 'asc' }, { titleAr: 'asc' }];

  const [items, total] = await prisma.$transaction([
    prisma.lookup.findMany({ where, skip, take: limit, orderBy }),
    prisma.lookup.count({ where }),
  ]);

  return {
    items: items.map(serialize),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getLookup = async (id) => {
  const row = await prisma.lookup.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw ApiError.notFound('Lookup not found');
  return serialize(row);
};

const updateLookup = async (id, body) => {
  const existing = await prisma.lookup.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw ApiError.notFound('Lookup not found');

  const data = {};
  if (body.titleAr !== undefined) data.titleAr = body.titleAr;
  if (body.titleEn !== undefined) data.titleEn = body.titleEn || null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.percentage !== undefined) {
    // percentage is only meaningful on TAX_TYPE rows; reject it elsewhere
    // (validation can't check this — `type` isn't in the update body).
    if (existing.type !== 'TAX_TYPE') {
      throw ApiError.badRequest('percentage can only be set on TAX_TYPE lookups');
    }
    data.percentage = body.percentage;
  }

  const updated = await prisma.lookup.update({ where: { id }, data });
  logger.info({ lookupId: id }, 'Lookup updated');
  return serialize(updated);
};

const deleteLookup = async (id) => {
  const existing = await prisma.lookup.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Lookup not found');

  /**
   * Soft-delete: consumer rows keep pointing at the id, which makes
   * the historical record correct ("this client had `Monthly`
   * contract type when created"), and the FE can still resolve the
   * label by id even after admin retires the option.
   *
   * For CarCase consumers we use ON DELETE RESTRICT at the SQL level,
   * so a HARD delete would block on FK. Soft-delete sidesteps that
   * entirely and is the only sensible policy here.
   */
  await prisma.lookup.update({ where: { id }, data: { deletedAt: new Date() } });
  logger.info({ lookupId: id }, 'Lookup soft-deleted');
};

module.exports = {
  loadActiveByType,
  createLookup,
  listLookups,
  getLookup,
  updateLookup,
  deleteLookup,
};

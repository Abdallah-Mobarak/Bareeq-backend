const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Representatives — FRD §3.10.
 * Service agreements with clients. The total price is computed by the
 * server (not trusted from the client) per FRD §3.10's instruction
 * that the rate is "managed only by the admin". For now the manager
 * sends the `hourlyRate` directly; once the admin module ships the
 * ServiceType table, this service will look up the rate by FK and
 * stop accepting it in the payload.
 *
 * We persist `price` alongside the three inputs so historical rows
 * remain accurate even if the rate is edited tomorrow.
 */

/**
 * Compute the agreement total. Using Number() on Prisma Decimals is
 * fine here — the multiplied result will round-trip to Prisma as a
 * Decimal again. If we ever start running this on tens-of-billions
 * type amounts, swap in Decimal.js to avoid float imprecision.
 */
const computePrice = ({ hourlyRate, numberOfWorkers, numberOfHours }) => {
  const total = Number(hourlyRate) * Number(numberOfWorkers) * Number(numberOfHours);
  // Round to 2 decimal places to keep currency output predictable.
  return Math.round(total * 100) / 100;
};

const serializeRepresentative = (r) => ({
  id: r.id,
  manager: r.manager
    ? { id: r.manager.id, nameAr: r.manager.nameAr, nameEn: r.manager.nameEn }
    : null,
  clientName: r.clientName,
  serviceType: r.serviceType,
  hourlyRate: r.hourlyRate,
  numberOfWorkers: r.numberOfWorkers,
  numberOfHours: r.numberOfHours,
  price: r.price,
  dateOfAgreement: r.dateOfAgreement,
  customerPhoneNumber: r.customerPhoneNumber,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const createRepresentative = async (managerId, body) => {
  const price = computePrice(body);

  const row = await prisma.representative.create({
    data: {
      managerId,
      clientName: body.clientName,
      serviceType: body.serviceType,
      hourlyRate: body.hourlyRate,
      numberOfWorkers: body.numberOfWorkers,
      numberOfHours: body.numberOfHours,
      price,
      dateOfAgreement: new Date(body.dateOfAgreement),
      customerPhoneNumber: body.customerPhoneNumber ?? null,
    },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeRepresentative(row);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.clientName) where.clientName = { contains: q.clientName, mode: 'insensitive' };
  if (q.serviceType) where.serviceType = { contains: q.serviceType, mode: 'insensitive' };
  if (q.customerPhoneNumber)
    where.customerPhoneNumber = { contains: q.customerPhoneNumber };

  if (q.dateFrom || q.dateTo) {
    where.dateOfAgreement = {};
    if (q.dateFrom) where.dateOfAgreement.gte = new Date(q.dateFrom);
    if (q.dateTo) where.dateOfAgreement.lte = new Date(q.dateTo);
  }

  return where;
};

const listRepresentatives = async (rawQuery) => {
  const { page = 1, limit = 20, sort = 'newest', ...filters } = rawQuery;
  const where = buildWhere(filters);

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'dateOfAgreement') orderBy = { dateOfAgreement: 'desc' };
  else if (sort === 'price') orderBy = { price: 'desc' };
  else orderBy = { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.representative.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.representative.count({ where }),
  ]);

  return {
    items: items.map(serializeRepresentative),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getRepresentativeById = async (id) => {
  const r = await prisma.representative.findFirst({
    where: { id, deletedAt: null },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!r) throw ApiError.notFound('Representative not found');
  return serializeRepresentative(r);
};

const updateRepresentative = async (id, body) => {
  const existing = await prisma.representative.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound('Representative not found');

  /**
   * If ANY of the price inputs changed, recompute the price using
   * the new value(s) merged onto the existing ones — partial PATCH
   * shouldn't force the client to resend all three.
   */
  const needsRecompute =
    body.hourlyRate !== undefined ||
    body.numberOfWorkers !== undefined ||
    body.numberOfHours !== undefined;

  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('clientName');
  setIf('serviceType');
  setIf('hourlyRate');
  setIf('numberOfWorkers');
  setIf('numberOfHours');
  setIf('dateOfAgreement', (v) => new Date(v));
  setIf('customerPhoneNumber', (v) => v ?? null);

  if (needsRecompute) {
    data.price = computePrice({
      hourlyRate: body.hourlyRate ?? existing.hourlyRate,
      numberOfWorkers: body.numberOfWorkers ?? existing.numberOfWorkers,
      numberOfHours: body.numberOfHours ?? existing.numberOfHours,
    });
  }

  const updated = await prisma.representative.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeRepresentative(updated);
};

const deleteRepresentative = async (id) => {
  const existing = await prisma.representative.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Representative not found');

  await prisma.representative.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

const EXPORT_HARD_LIMIT = 5000;

const listRepresentativesForExport = async (rawQuery) => {
  const where = buildWhere(rawQuery);

  const items = await prisma.representative.findMany({
    where,
    orderBy: { dateOfAgreement: 'desc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      manager: { select: { nameAr: true, nameEn: true } },
    },
  });

  return items.map((r) => ({
    clientName: r.clientName,
    serviceType: r.serviceType,
    hourlyRate: r.hourlyRate ? Number(r.hourlyRate) : null,
    numberOfWorkers: r.numberOfWorkers,
    numberOfHours: r.numberOfHours ? Number(r.numberOfHours) : null,
    price: r.price ? Number(r.price) : null,
    dateOfAgreement: r.dateOfAgreement
      ? new Date(r.dateOfAgreement).toISOString().slice(0, 10)
      : null,
    customerPhoneNumber: r.customerPhoneNumber,
    createdBy: r.manager
      ? `${r.manager.nameAr}${r.manager.nameEn ? ` (${r.manager.nameEn})` : ''}`
      : null,
  }));
};

module.exports = {
  createRepresentative,
  listRepresentatives,
  getRepresentativeById,
  updateRepresentative,
  deleteRepresentative,
  listRepresentativesForExport,
};

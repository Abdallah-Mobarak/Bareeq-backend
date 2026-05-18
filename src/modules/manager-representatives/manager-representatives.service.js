const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Representatives — FRD §3.10.
 *
 * Service agreements with clients. The manager picks a `serviceTypeId`
 * from the admin-managed catalog; the server reads the canonical
 * `hourlyRate` from that ServiceType and computes the total price.
 * The hourlyRate is snapshotted into the Representative's `price` so
 * historical rows survive future rate edits unchanged.
 */

/**
 * Compute the agreement total from the ServiceType's hourlyRate.
 * Using Number() on Prisma Decimals is fine here — the multiplied
 * result will round-trip back as Decimal. If we ever need
 * tens-of-billions precision, swap in Decimal.js.
 */
const computePrice = ({ hourlyRate, numberOfWorkers, numberOfHours }) => {
  const total = Number(hourlyRate) * Number(numberOfWorkers) * Number(numberOfHours);
  return Math.round(total * 100) / 100;
};

const serializeServiceType = (st) =>
  st
    ? {
        id: st.id,
        nameAr: st.nameAr,
        nameEn: st.nameEn,
        hourlyRate: st.hourlyRate ? Number(st.hourlyRate) : 0,
      }
    : null;

const serializeRepresentative = (r) => ({
  id: r.id,
  manager: r.manager
    ? { id: r.manager.id, nameAr: r.manager.nameAr, nameEn: r.manager.nameEn }
    : null,
  clientName: r.clientName,
  serviceType: serializeServiceType(r.serviceType),
  numberOfWorkers: r.numberOfWorkers,
  numberOfHours: r.numberOfHours,
  price: r.price,
  dateOfAgreement: r.dateOfAgreement,
  customerPhoneNumber: r.customerPhoneNumber,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/**
 * Look up a ServiceType by id and fail loudly if missing / soft-deleted.
 * Returns the full row so callers can read `hourlyRate` for pricing.
 */
const loadActiveServiceType = async (serviceTypeId) => {
  const st = await prisma.serviceType.findFirst({
    where: { id: serviceTypeId, deletedAt: null },
  });
  if (!st) throw ApiError.badRequest('Invalid serviceTypeId');
  return st;
};

const createRepresentative = async (managerId, body) => {
  const st = await loadActiveServiceType(body.serviceTypeId);
  const price = computePrice({
    hourlyRate: st.hourlyRate,
    numberOfWorkers: body.numberOfWorkers,
    numberOfHours: body.numberOfHours,
  });

  const row = await prisma.representative.create({
    data: {
      managerId,
      clientName: body.clientName,
      serviceTypeId: st.id,
      numberOfWorkers: body.numberOfWorkers,
      numberOfHours: body.numberOfHours,
      price,
      dateOfAgreement: new Date(body.dateOfAgreement),
      customerPhoneNumber: body.customerPhoneNumber ?? null,
    },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      serviceType: true,
    },
  });
  return serializeRepresentative(row);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };

  if (q.clientName) where.clientName = { contains: q.clientName, mode: 'insensitive' };
  if (q.serviceTypeId) where.serviceTypeId = q.serviceTypeId;
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
        serviceType: true,
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
      serviceType: true,
    },
  });
  if (!r) throw ApiError.notFound('Representative not found');
  return serializeRepresentative(r);
};

const updateRepresentative = async (id, body) => {
  const existing = await prisma.representative.findFirst({
    where: { id, deletedAt: null },
    include: { serviceType: true },
  });
  if (!existing) throw ApiError.notFound('Representative not found');

  /**
   * Recompute price if any of the three pricing inputs changed.
   * If the manager swapped the ServiceType, we read the new
   * hourlyRate from the new ServiceType; otherwise we reuse the
   * one already on the existing relation.
   */
  const needsRecompute =
    body.serviceTypeId !== undefined ||
    body.numberOfWorkers !== undefined ||
    body.numberOfHours !== undefined;

  let nextServiceType = existing.serviceType;
  if (body.serviceTypeId !== undefined && body.serviceTypeId !== existing.serviceTypeId) {
    nextServiceType = await loadActiveServiceType(body.serviceTypeId);
  }

  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('clientName');
  setIf('serviceTypeId');
  setIf('numberOfWorkers');
  setIf('numberOfHours');
  setIf('dateOfAgreement', (v) => new Date(v));
  setIf('customerPhoneNumber', (v) => v ?? null);

  if (needsRecompute) {
    data.price = computePrice({
      hourlyRate: nextServiceType.hourlyRate,
      numberOfWorkers: body.numberOfWorkers ?? existing.numberOfWorkers,
      numberOfHours: body.numberOfHours ?? existing.numberOfHours,
    });
  }

  const updated = await prisma.representative.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      serviceType: true,
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
      serviceType: { select: { nameAr: true, nameEn: true, hourlyRate: true } },
    },
  });

  return items.map((r) => ({
    clientName: r.clientName,
    serviceTypeAr: r.serviceType?.nameAr ?? null,
    serviceTypeEn: r.serviceType?.nameEn ?? null,
    hourlyRate: r.serviceType?.hourlyRate ? Number(r.serviceType.hourlyRate) : null,
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

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const lookupService = require('../admin-lookups/admin-lookups.service');

/**
 * Car Cases — FRD §3.8.
 *
 * Manager-managed vehicle records linked to a supervisor. Area /
 * License Plate / Vehicle Condition are admin-managed Lookups
 * (FRD §4.10.2). The manager passes Lookup IDs; the service layer
 * validates each id targets a Lookup of the matching type before
 * the row is written.
 */

const serializeLookup = (l) =>
  l ? { id: l.id, titleAr: l.titleAr, titleEn: l.titleEn } : null;

const serializeCarCase = (c) => ({
  id: c.id,
  manager: c.manager
    ? { id: c.manager.id, nameAr: c.manager.nameAr, nameEn: c.manager.nameEn }
    : null,
  supervisor: c.supervisor
    ? { id: c.supervisor.id, nameAr: c.supervisor.nameAr, nameEn: c.supervisor.nameEn }
    : null,
  area: serializeLookup(c.area),
  licensePlate: serializeLookup(c.licensePlate),
  vehicleCondition: serializeLookup(c.vehicleCondition),
  oilChangeDate: c.oilChangeDate,
  notes: c.notes,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const assertValidSupervisor = async (supervisorId) => {
  const u = await prisma.user.findFirst({
    where: { id: supervisorId, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!u) throw ApiError.badRequest('Supervisor not found');
  if (u.status === 'BLOCKED') throw ApiError.badRequest('Supervisor is blocked');
  return u;
};

/**
 * Validate all three lookup FKs in parallel. Each id must reference a
 * Lookup row of the expected type or this throws — happens BEFORE the
 * write so partial writes are impossible.
 */
const validateLookupFks = async (body) => {
  const tasks = [];
  if (body.areaId) tasks.push(lookupService.loadActiveByType(body.areaId, 'AREA'));
  if (body.licensePlateId)
    tasks.push(lookupService.loadActiveByType(body.licensePlateId, 'LICENSE_PLATE'));
  if (body.vehicleConditionId)
    tasks.push(
      lookupService.loadActiveByType(body.vehicleConditionId, 'VEHICLE_CONDITION'),
    );
  await Promise.all(tasks);
};

const carCaseInclude = {
  manager: { select: { id: true, nameAr: true, nameEn: true } },
  supervisor: { select: { id: true, nameAr: true, nameEn: true } },
  area: true,
  licensePlate: true,
  vehicleCondition: true,
};

const createCarCase = async (managerId, body) => {
  await assertValidSupervisor(body.supervisorId);
  await validateLookupFks(body);

  const row = await prisma.carCase.create({
    data: {
      managerId,
      supervisorId: body.supervisorId,
      areaId: body.areaId,
      licensePlateId: body.licensePlateId,
      vehicleConditionId: body.vehicleConditionId,
      oilChangeDate: body.oilChangeDate ? new Date(body.oilChangeDate) : null,
      notes: body.notes ?? null,
    },
    include: carCaseInclude,
  });
  return serializeCarCase(row);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };
  if (q.supervisorId) where.supervisorId = q.supervisorId;
  if (q.areaId) where.areaId = q.areaId;
  if (q.licensePlateId) where.licensePlateId = q.licensePlateId;
  if (q.vehicleConditionId) where.vehicleConditionId = q.vehicleConditionId;

  if (q.supervisorName) {
    where.supervisor = {
      OR: [
        { nameAr: { contains: q.supervisorName, mode: 'insensitive' } },
        { nameEn: { contains: q.supervisorName, mode: 'insensitive' } },
      ],
    };
  }

  if (q.oilChangeDateFrom || q.oilChangeDateTo) {
    where.oilChangeDate = {};
    if (q.oilChangeDateFrom) where.oilChangeDate.gte = new Date(q.oilChangeDateFrom);
    if (q.oilChangeDateTo) where.oilChangeDate.lte = new Date(q.oilChangeDateTo);
  }

  return where;
};

const listCarCases = async (rawQuery) => {
  const { page = 1, limit = 20, sort = 'newest', ...filters } = rawQuery;
  const where = buildWhere(filters);

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'oilChangeDate') orderBy = { oilChangeDate: 'asc' };
  else orderBy = { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.carCase.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: carCaseInclude,
    }),
    prisma.carCase.count({ where }),
  ]);

  return {
    items: items.map(serializeCarCase),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getCarCaseById = async (id) => {
  const c = await prisma.carCase.findFirst({
    where: { id, deletedAt: null },
    include: carCaseInclude,
  });
  if (!c) throw ApiError.notFound('Car case not found');
  return serializeCarCase(c);
};

const updateCarCase = async (id, body) => {
  const existing = await prisma.carCase.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Car case not found');

  if (body.supervisorId) await assertValidSupervisor(body.supervisorId);
  await validateLookupFks(body);

  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('supervisorId');
  setIf('areaId');
  setIf('licensePlateId');
  setIf('vehicleConditionId');
  setIf('oilChangeDate', (v) => (v ? new Date(v) : null));
  setIf('notes', (v) => v ?? null);

  const updated = await prisma.carCase.update({
    where: { id },
    data,
    include: carCaseInclude,
  });
  return serializeCarCase(updated);
};

const deleteCarCase = async (id) => {
  const existing = await prisma.carCase.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Car case not found');

  await prisma.carCase.update({ where: { id }, data: { deletedAt: new Date() } });
};

const EXPORT_HARD_LIMIT = 5000;

const listCarCasesForExport = async (rawQuery) => {
  const where = buildWhere(rawQuery);

  const items = await prisma.carCase.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      supervisor: { select: { nameAr: true, nameEn: true } },
      area: { select: { titleAr: true, titleEn: true } },
      licensePlate: { select: { titleAr: true, titleEn: true } },
      vehicleCondition: { select: { titleAr: true, titleEn: true } },
    },
  });

  return items.map((c) => ({
    supervisor: c.supervisor
      ? `${c.supervisor.nameAr}${c.supervisor.nameEn ? ` (${c.supervisor.nameEn})` : ''}`
      : null,
    area: c.area?.titleAr ?? null,
    licensePlate: c.licensePlate?.titleAr ?? null,
    vehicleCondition: c.vehicleCondition?.titleAr ?? null,
    oilChangeDate: c.oilChangeDate
      ? new Date(c.oilChangeDate).toISOString().slice(0, 10)
      : null,
    notes: c.notes,
  }));
};

module.exports = {
  createCarCase,
  listCarCases,
  getCarCaseById,
  updateCarCase,
  deleteCarCase,
  listCarCasesForExport,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Car Cases — FRD §3.8.
 * Manager-managed vehicle records, each linked to a supervisor.
 * Admin-managed lookups (area / licensePlate / vehicleCondition) are
 * stored as strings until the admin module ships the lookup tables —
 * same approach as the Client model.
 */

const serializeCarCase = (c) => ({
  id: c.id,
  manager: c.manager
    ? { id: c.manager.id, nameAr: c.manager.nameAr, nameEn: c.manager.nameEn }
    : null,
  supervisor: c.supervisor
    ? { id: c.supervisor.id, nameAr: c.supervisor.nameAr, nameEn: c.supervisor.nameEn }
    : null,
  area: c.area,
  licensePlate: c.licensePlate,
  vehicleCondition: c.vehicleCondition,
  oilChangeDate: c.oilChangeDate,
  notes: c.notes,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/**
 * Reject a supervisor that doesn't exist, isn't enabled, or isn't a
 * SUPERVISOR. Same defensive guard used by AdditionalTask — keeps the
 * relation honest at write time so reports don't pick up dangling rows.
 */
const assertValidSupervisor = async (supervisorId) => {
  const u = await prisma.user.findFirst({
    where: { id: supervisorId, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!u) throw ApiError.badRequest('Supervisor not found');
  if (u.status === 'BLOCKED') throw ApiError.badRequest('Supervisor is blocked');
  return u;
};

const createCarCase = async (managerId, body) => {
  await assertValidSupervisor(body.supervisorId);

  const row = await prisma.carCase.create({
    data: {
      managerId,
      supervisorId: body.supervisorId,
      area: body.area,
      licensePlate: body.licensePlate,
      vehicleCondition: body.vehicleCondition,
      oilChangeDate: body.oilChangeDate ? new Date(body.oilChangeDate) : null,
      notes: body.notes ?? null,
    },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeCarCase(row);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };
  if (q.supervisorId) where.supervisorId = q.supervisorId;
  if (q.area) where.area = { contains: q.area, mode: 'insensitive' };
  if (q.licensePlate) where.licensePlate = { contains: q.licensePlate, mode: 'insensitive' };
  if (q.vehicleCondition)
    where.vehicleCondition = { contains: q.vehicleCondition, mode: 'insensitive' };

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
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
        supervisor: { select: { id: true, nameAr: true, nameEn: true } },
      },
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
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
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

  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('supervisorId');
  setIf('area');
  setIf('licensePlate');
  setIf('vehicleCondition');
  setIf('oilChangeDate', (v) => (v ? new Date(v) : null));
  setIf('notes', (v) => v ?? null);

  const updated = await prisma.carCase.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
      supervisor: { select: { id: true, nameAr: true, nameEn: true } },
    },
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
    },
  });

  return items.map((c) => ({
    supervisor: c.supervisor
      ? `${c.supervisor.nameAr}${c.supervisor.nameEn ? ` (${c.supervisor.nameEn})` : ''}`
      : null,
    area: c.area,
    licensePlate: c.licensePlate,
    vehicleCondition: c.vehicleCondition,
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

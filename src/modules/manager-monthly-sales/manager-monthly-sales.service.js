const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Monthly Sales / Clients — FRD §3.7.
 *
 * Manager-managed sales contracts. The admin-managed lookups (contract
 * type / tax / contract status) are stored as free-text strings for
 * Phase D.1 — see schema comment on the Client model. The API still
 * accepts them as strings even when we later migrate to FKs (we'll
 * just route them through a lookup-by-name resolver server-side).
 */

const serializeClient = (c) => ({
  id: c.id,
  manager: c.manager
    ? { id: c.manager.id, nameAr: c.manager.nameAr, nameEn: c.manager.nameEn }
    : null,
  name: c.name,
  contractType: c.contractType,
  statement: c.statement,
  website: c.website,
  price: c.price,
  taxType: c.taxType,
  date: c.date,
  contractStatus: c.contractStatus,
  notes: c.notes,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const createClient = async (managerId, body) => {
  const client = await prisma.client.create({
    data: {
      managerId,
      name: body.name,
      contractType: body.contractType ?? null,
      statement: body.statement ?? null,
      website: body.website ?? null,
      price: body.price ?? null,
      taxType: body.taxType ?? null,
      date: new Date(body.date),
      contractStatus: body.contractStatus ?? null,
      notes: body.notes ?? null,
    },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeClient(client);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.name) where.name = { contains: q.name, mode: 'insensitive' };
  if (q.contractType) where.contractType = { contains: q.contractType, mode: 'insensitive' };
  if (q.statement) where.statement = { contains: q.statement, mode: 'insensitive' };
  if (q.website) where.website = { contains: q.website, mode: 'insensitive' };
  if (q.taxType) where.taxType = { contains: q.taxType, mode: 'insensitive' };
  if (q.contractStatus) where.contractStatus = { contains: q.contractStatus, mode: 'insensitive' };

  /**
   * Price as range. The FRD §3.7.4 lists price as a filter — we expose
   * both minPrice and maxPrice so the UI can offer a slider without an
   * extra round trip.
   */
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    where.price = {};
    if (q.minPrice !== undefined) where.price.gte = q.minPrice;
    if (q.maxPrice !== undefined) where.price.lte = q.maxPrice;
  }

  if (q.dateFrom || q.dateTo) {
    where.date = {};
    if (q.dateFrom) where.date.gte = new Date(q.dateFrom);
    if (q.dateTo) where.date.lte = new Date(q.dateTo);
  }

  return where;
};

const listClients = async (rawQuery) => {
  const { page = 1, limit = 20, sort = 'newest', ...filters } = rawQuery;
  const where = buildWhere(filters);

  let orderBy;
  if (sort === 'oldest') orderBy = { createdAt: 'asc' };
  else if (sort === 'date') orderBy = { date: 'desc' };
  else if (sort === 'name') orderBy = { name: 'asc' };
  else orderBy = { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.client.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        manager: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return {
    items: items.map(serializeClient),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getClientById = async (id) => {
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!client) throw ApiError.notFound('Client not found');
  return serializeClient(client);
};

const updateClient = async (id, body) => {
  const existing = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Client not found');

  /**
   * Partial update. Only fields that are explicitly present in the
   * body get written — undefined means "leave as-is", null means
   * "clear this field". This lets the UI reset an optional field
   * (e.g. clear `notes`) by sending `notes: null`.
   */
  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('name');
  setIf('contractType', (v) => v ?? null);
  setIf('statement', (v) => v ?? null);
  setIf('website', (v) => v ?? null);
  setIf('price', (v) => v ?? null);
  setIf('taxType', (v) => v ?? null);
  setIf('date', (v) => new Date(v));
  setIf('contractStatus', (v) => v ?? null);
  setIf('notes', (v) => v ?? null);

  const updated = await prisma.client.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeClient(updated);
};

const deleteClient = async (id) => {
  const existing = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Client not found');

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

const EXPORT_HARD_LIMIT = 5000;

const listClientsForExport = async (rawQuery) => {
  const where = buildWhere(rawQuery);

  const items = await prisma.client.findMany({
    where,
    orderBy: { date: 'desc' },
    take: EXPORT_HARD_LIMIT,
    include: {
      manager: { select: { nameAr: true, nameEn: true } },
    },
  });

  return items.map((c) => ({
    name: c.name,
    contractType: c.contractType,
    statement: c.statement,
    website: c.website,
    price: c.price ? Number(c.price) : null,
    taxType: c.taxType,
    date: c.date ? new Date(c.date).toISOString().slice(0, 10) : null,
    contractStatus: c.contractStatus,
    createdBy: c.manager
      ? `${c.manager.nameAr}${c.manager.nameEn ? ` (${c.manager.nameEn})` : ''}`
      : null,
    notes: c.notes,
  }));
};

module.exports = {
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
  listClientsForExport,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const lookupService = require('../admin-lookups/admin-lookups.service');

/**
 * Monthly Sales / Clients — FRD §3.7.
 *
 * Manager-managed sales contracts. Contract Type / Tax Type /
 * Contract Status are admin-managed Lookups (FRD §4.9.2). The
 * manager passes Lookup IDs; the service layer validates each id
 * targets a Lookup row of the matching type via the shared
 * lookupService.loadActiveByType() helper.
 */

const serializeLookup = (l) =>
  l ? { id: l.id, titleAr: l.titleAr, titleEn: l.titleEn } : null;

const serializeClient = (c) => ({
  id: c.id,
  manager: c.manager
    ? { id: c.manager.id, nameAr: c.manager.nameAr, nameEn: c.manager.nameEn }
    : null,
  name: c.name,
  contractType: serializeLookup(c.contractType),
  statement: c.statement,
  website: c.website,
  price: c.price,
  taxType: serializeLookup(c.taxType),
  date: c.date,
  contractStatus: serializeLookup(c.contractStatus),
  notes: c.notes,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/**
 * Resolve the three optional lookup FKs in parallel. Each must point
 * at a row of the expected type, or this throws and the calling
 * write is aborted before any DB write happens.
 *
 * Empty string ('') is treated as null — the FE sometimes posts ''
 * for "no selection" and we'd rather clear the FK than fail validation.
 */
const validateLookupFks = async (body) => {
  const tasks = [];
  if (body.contractTypeId)
    tasks.push(lookupService.loadActiveByType(body.contractTypeId, 'CONTRACT_TYPE'));
  if (body.taxTypeId)
    tasks.push(lookupService.loadActiveByType(body.taxTypeId, 'TAX_TYPE'));
  if (body.contractStatusId)
    tasks.push(lookupService.loadActiveByType(body.contractStatusId, 'CONTRACT_STATUS'));
  await Promise.all(tasks);
};

const clientInclude = {
  manager: { select: { id: true, nameAr: true, nameEn: true } },
  contractType: true,
  taxType: true,
  contractStatus: true,
};

const createClient = async (managerId, body) => {
  await validateLookupFks(body);

  const client = await prisma.client.create({
    data: {
      managerId,
      name: body.name,
      contractTypeId: body.contractTypeId || null,
      statement: body.statement ?? null,
      website: body.website ?? null,
      price: body.price ?? null,
      taxTypeId: body.taxTypeId || null,
      date: new Date(body.date),
      contractStatusId: body.contractStatusId || null,
      notes: body.notes ?? null,
    },
    include: clientInclude,
  });
  return serializeClient(client);
};

const buildWhere = (q) => {
  const where = { deletedAt: null };

  if (q.ids && q.ids.length > 0) where.id = { in: q.ids };
  if (q.name) where.name = { contains: q.name, mode: 'insensitive' };
  if (q.contractTypeId) where.contractTypeId = q.contractTypeId;
  if (q.statement) where.statement = { contains: q.statement, mode: 'insensitive' };
  if (q.website) where.website = { contains: q.website, mode: 'insensitive' };
  if (q.taxTypeId) where.taxTypeId = q.taxTypeId;
  if (q.contractStatusId) where.contractStatusId = q.contractStatusId;

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
      include: clientInclude,
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
    include: clientInclude,
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

  await validateLookupFks(body);

  const data = {};
  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) data[key] = transform(body[key]);
  };
  setIf('name');
  setIf('contractTypeId', (v) => v || null);
  setIf('statement', (v) => v ?? null);
  setIf('website', (v) => v ?? null);
  setIf('price', (v) => v ?? null);
  setIf('taxTypeId', (v) => v || null);
  setIf('date', (v) => new Date(v));
  setIf('contractStatusId', (v) => v || null);
  setIf('notes', (v) => v ?? null);

  const updated = await prisma.client.update({
    where: { id },
    data,
    include: clientInclude,
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
      contractType: { select: { titleAr: true, titleEn: true } },
      taxType: { select: { titleAr: true, titleEn: true } },
      contractStatus: { select: { titleAr: true, titleEn: true } },
    },
  });

  return items.map((c) => ({
    name: c.name,
    contractType: c.contractType?.titleAr ?? null,
    statement: c.statement,
    website: c.website,
    price: c.price ? Number(c.price) : null,
    taxType: c.taxType?.titleAr ?? null,
    date: c.date ? new Date(c.date).toISOString().slice(0, 10) : null,
    contractStatus: c.contractStatus?.titleAr ?? null,
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

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');

const serializeBranch = (b) => ({
  id: b.id,
  companyId: b.companyId,
  company: b.company
    ? { id: b.company.id, nameAr: b.company.nameAr, nameEn: b.company.nameEn }
    : null,
  categoryId: b.categoryId,
  category: b.category
    ? { id: b.category.id, nameAr: b.category.nameAr, nameEn: b.category.nameEn }
    : null,
  regionId: b.regionId,
  region: b.region ? { id: b.region.id, nameAr: b.region.nameAr, nameEn: b.region.nameEn } : null,
  cityId: b.cityId,
  city: b.city ? { id: b.city.id, nameAr: b.city.nameAr, nameEn: b.city.nameEn } : null,
  nameAr: b.nameAr,
  nameEn: b.nameEn,
  branchNumber: b.branchNumber,
  code: b.code,
  addressAr: b.addressAr,
  addressEn: b.addressEn,
  latitude: b.latitude !== null && b.latitude !== undefined ? Number(b.latitude) : null,
  longitude: b.longitude !== null && b.longitude !== undefined ? Number(b.longitude) : null,
  visitsPerMonth: b.visitsPerMonth,
  requiredTasks:
    b.requiredTasks?.map((t) => ({
      id: t.id,
      visitType: t.visitType,
      titleAr: t.titleAr,
      titleEn: t.titleEn,
      sortOrder: t.sortOrder,
    })) ?? [],
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

/**
 * Validate that all the FK ids the caller provided actually exist
 * (and aren't soft-deleted). Throws on the FIRST missing one — the
 * client will see exactly which FK was wrong.
 */
const validateRefs = async ({ companyId, regionId, cityId, categoryId }) => {
  if (companyId) {
    const c = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!c) {
      throw ApiError.badRequest('Company not found');
    }
  }
  if (regionId) {
    const r = await prisma.region.findFirst({
      where: { id: regionId, deletedAt: null },
    });
    if (!r) {
      throw ApiError.badRequest('Region not found');
    }
  }
  if (cityId) {
    const ct = await prisma.city.findFirst({
      where: { id: cityId, deletedAt: null },
    });
    if (!ct) {
      throw ApiError.badRequest('City not found');
    }
    // Sanity: the city should belong to the region (if both given).
    if (regionId && ct.regionId !== regionId) {
      throw ApiError.badRequest('City does not belong to the given region');
    }
  }
  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!cat) {
      throw ApiError.badRequest('Category not found');
    }
  }
};

const createBranch = async (input) => {
  const {
    companyId,
    categoryId,
    regionId,
    cityId,
    nameAr,
    nameEn,
    branchNumber,
    code,
    addressAr,
    addressEn,
    latitude,
    longitude,
    visitsPerMonth,
    requiredTasks,
  } = input;

  await validateRefs({ companyId, regionId, cityId, categoryId });

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({
      data: {
        companyId,
        categoryId: categoryId || null,
        regionId,
        cityId,
        nameAr,
        nameEn: nameEn || null,
        branchNumber: branchNumber || null,
        code: code || null,
        addressAr: addressAr || null,
        addressEn: addressEn || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        visitsPerMonth,
      },
    });

    if (requiredTasks?.length) {
      await tx.branchRequiredTask.createMany({
        data: requiredTasks.map((t) => ({
          branchId: created.id,
          visitType: t.visitType,
          titleAr: t.titleAr,
          titleEn: t.titleEn || null,
          sortOrder: t.sortOrder ?? 0,
        })),
      });
    }

    return tx.branch.findUnique({
      where: { id: created.id },
      include: {
        company: true,
        category: true,
        region: true,
        city: true,
        requiredTasks: {
          where: { deletedAt: null },
          orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });
  });

  logger.info({ branchId: branch.id }, 'Branch created');
  return serializeBranch(branch);
};

const listBranches = async ({ page, limit, q, companyId, regionId, cityId, categoryId, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(companyId && { companyId }),
    ...(regionId && { regionId }),
    ...(cityId && { cityId }),
    ...(categoryId && { categoryId }),
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { branchNumber: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { addressAr: { contains: q, mode: 'insensitive' } },
        { addressEn: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'name'
        ? { nameAr: 'asc' }
        : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        company: true,
        category: true,
        region: true,
        city: true,
        requiredTasks: {
          where: { deletedAt: null },
          orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    }),
    prisma.branch.count({ where }),
  ]);

  return {
    items: items.map(serializeBranch),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getBranch = async (id) => {
  const branch = await prisma.branch.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      category: true,
      region: true,
      city: true,
      requiredTasks: {
        where: { deletedAt: null },
        orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
      },
    },
  });
  if (!branch) {
    throw ApiError.notFound('Branch not found');
  }
  return serializeBranch(branch);
};

const updateBranch = async (id, input) => {
  const existing = await prisma.branch.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Branch not found');
  }

  // Re-validate any FKs the caller is changing
  await validateRefs({
    companyId: input.companyId,
    regionId: input.regionId ?? (input.cityId ? existing.regionId : undefined),
    cityId: input.cityId,
    categoryId: input.categoryId,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.branch.update({
      where: { id },
      data: {
        ...(input.companyId !== undefined && { companyId: input.companyId }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId || null }),
        ...(input.regionId !== undefined && { regionId: input.regionId }),
        ...(input.cityId !== undefined && { cityId: input.cityId }),
        ...(input.nameAr !== undefined && { nameAr: input.nameAr }),
        ...(input.nameEn !== undefined && { nameEn: input.nameEn || null }),
        ...(input.branchNumber !== undefined && { branchNumber: input.branchNumber || null }),
        ...(input.code !== undefined && { code: input.code || null }),
        ...(input.addressAr !== undefined && { addressAr: input.addressAr || null }),
        ...(input.addressEn !== undefined && { addressEn: input.addressEn || null }),
        ...(input.latitude !== undefined && { latitude: input.latitude }),
        ...(input.longitude !== undefined && { longitude: input.longitude }),
        ...(input.visitsPerMonth !== undefined && { visitsPerMonth: input.visitsPerMonth }),
      },
    });

    // Replace tasks if the caller passed an array.
    // (Omitting requiredTasks leaves existing ones untouched.)
    if (input.requiredTasks !== undefined) {
      await tx.branchRequiredTask.deleteMany({ where: { branchId: id } });
      if (input.requiredTasks.length > 0) {
        await tx.branchRequiredTask.createMany({
          data: input.requiredTasks.map((t) => ({
            branchId: id,
            visitType: t.visitType,
            titleAr: t.titleAr,
            titleEn: t.titleEn || null,
            sortOrder: t.sortOrder ?? 0,
          })),
        });
      }
    }

    return tx.branch.findUnique({
      where: { id },
      include: {
        company: true,
        category: true,
        region: true,
        city: true,
        requiredTasks: {
          where: { deletedAt: null },
          orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });
  });

  logger.info({ branchId: id }, 'Branch updated');
  return serializeBranch(updated);
};

const deleteBranch = async (id) => {
  const existing = await prisma.branch.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Branch not found');
  }

  await prisma.branch.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ branchId: id }, 'Branch soft-deleted');
};

module.exports = { createBranch, listBranches, getBranch, updateBranch, deleteBranch };

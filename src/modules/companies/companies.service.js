const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');

/**
 * Shape returned to API consumers. Never leak the login user's password.
 * Includes the login user as a nested object so admins can see who logs in.
 */
const serializeCompany = (c) => ({
  id: c.id,
  nameAr: c.nameAr,
  nameEn: c.nameEn,
  contactEmail: c.contactEmail,
  contactPhone: c.contactPhone,
  loginUser: c.loginUsers?.[0]
    ? {
        id: c.loginUsers[0].id,
        email: c.loginUsers[0].email,
        phone: c.loginUsers[0].phone,
        status: c.loginUsers[0].status,
      }
    : null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/**
 * NOTE: there is no `createCompany` here.
 *
 * Companies are created implicitly by `POST /assign-company` when the
 * admin picks a previously-unassigned companyName. Direct creation is
 * intentionally not supported — see companies.routes.js for the why.
 */

const listCompanies = async ({ page, limit, q, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
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
    prisma.company.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        loginUsers: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    items: items.map(serializeCompany),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Same shape as listCompanies but no pagination — all matching rows.
 * Used by the Excel export endpoint. We cap at 5000 to avoid blowing
 * up the worker if `q` is empty on a huge tenant; if anyone hits it
 * we'll switch to streaming.
 */
const listAllCompaniesForExport = async ({ q, sort } = {}) => {
  const where = {
    deletedAt: null,
    ...(q && {
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };
  const orderBy =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'name'
        ? { nameAr: 'asc' }
        : { createdAt: 'desc' };

  const items = await prisma.company.findMany({
    where,
    orderBy,
    take: 5000,
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  return items.map(serializeCompany);
};

const getCompany = async (id) => {
  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!company) {
    throw ApiError.notFound('Company not found');
  }
  return serializeCompany(company);
};

const updateCompany = async (id, { nameAr, nameEn, contactEmail, contactPhone }) => {
  const existing = await prisma.company.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Company not found');
  }

  const updated = await prisma.company.update({
    where: { id },
    data: {
      ...(nameAr !== undefined && { nameAr }),
      ...(nameEn !== undefined && { nameEn: nameEn || null }),
      ...(contactEmail !== undefined && { contactEmail: contactEmail || null }),
      ...(contactPhone !== undefined && { contactPhone: contactPhone || null }),
    },
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  logger.info({ companyId: id }, 'Company updated');
  return serializeCompany(updated);
};

/**
 * Soft delete: hides the company from listings AND revokes the login
 * user's sessions + soft-deletes the login account so they can't log in.
 * Branches that belong to this company are NOT cascaded — admin must
 * decide what to do with them. (We can revisit if real usage warrants.)
 */
const deleteCompany = async (id) => {
  const existing = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      loginUsers: { where: { deletedAt: null } },
    },
  });
  if (!existing) {
    throw ApiError.notFound('Company not found');
  }

  // Block delete if there are still active branches under this company.
  const activeBranch = await prisma.branch.findFirst({
    where: { companyId: id, deletedAt: null },
  });
  if (activeBranch) {
    throw ApiError.conflict('Company has active branches; delete or reassign them first');
  }

  const loginUserIds = existing.loginUsers.map((u) => u.id);

  await prisma.$transaction([
    prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { id: { in: loginUserIds } },
      data: { deletedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: { in: loginUserIds }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ companyId: id }, 'Company soft-deleted');
};

/**
 * Update the login user's email / phone (not the Company entity itself).
 */
const updateCompanyLogin = async (id, { email, phone }) => {
  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!company || company.loginUsers.length === 0) {
    throw ApiError.notFound('Company or login account not found');
  }

  const loginUser = company.loginUsers[0];

  if (email && email !== loginUser.email) {
    const c = await prisma.user.findFirst({
      where: { email, id: { not: loginUser.id }, deletedAt: null },
    });
    if (c) {
      throw ApiError.conflict('Email already in use');
    }
  }
  if (phone && phone !== loginUser.phone) {
    const c = await prisma.user.findFirst({
      where: { phone, id: { not: loginUser.id }, deletedAt: null },
    });
    if (c) {
      throw ApiError.conflict('Phone already in use');
    }
  }

  await prisma.user.update({
    where: { id: loginUser.id },
    data: {
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
    },
  });

  logger.info({ companyId: id, loginUserId: loginUser.id }, 'Company login updated');
  return getCompany(id);
};

const changeCompanyPassword = async (id, newPassword) => {
  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!company || company.loginUsers.length === 0) {
    throw ApiError.notFound('Company or login account not found');
  }

  const loginUser = company.loginUsers[0];
  const passwordHash = await password.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: loginUser.id },
      data: { password: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: loginUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ companyId: id }, 'Company login password reset by admin');
};

const updateCompanyStatus = async (id, status) => {
  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      loginUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!company || company.loginUsers.length === 0) {
    throw ApiError.notFound('Company or login account not found');
  }

  const loginUser = company.loginUsers[0];
  if (loginUser.status === status) {
    return getCompany(id);
  }

  const ops = [
    prisma.user.update({
      where: { id: loginUser.id },
      data: { status },
    }),
  ];
  if (status === 'BLOCKED') {
    ops.push(
      prisma.refreshToken.updateMany({
        where: { userId: loginUser.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  await prisma.$transaction(ops);
  logger.info({ companyId: id, status }, 'Company login status changed');
  return getCompany(id);
};

module.exports = {
  listCompanies,
  listAllCompaniesForExport,
  getCompany,
  updateCompany,
  deleteCompany,
  updateCompanyLogin,
  changeCompanyPassword,
  updateCompanyStatus,
};

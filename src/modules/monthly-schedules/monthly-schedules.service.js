const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { distributeVisitDates } = require('../../utils/scheduleDistribution');

/**
 * Trim a User into the small payload we ever expose for a supervisor.
 */
const serializeSupervisor = (u) =>
  u ? { id: u.id, email: u.email, phone: u.phone, nameAr: u.nameAr, nameEn: u.nameEn } : null;

const serializeBranch = (b) =>
  b
    ? {
        id: b.id,
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        branchNumber: b.branchNumber,
        code: b.code,
      }
    : null;

const serializeInstance = (i) => ({
  id: i.id,
  visitOrder: i.visitOrder,
  scheduledDate: i.scheduledDate,
  status: i.status,
  documentationStatus: i.documentationStatus,
  lockedAt: i.lockedAt,
});

const serializeScheduledVisit = (sv) => ({
  id: sv.id,
  type: sv.type,
  branchId: sv.branchId,
  branch: serializeBranch(sv.branch),
  numberOfVisits: sv.numberOfVisits,
  firstVisitDate: sv.firstVisitDate,
  instances: sv.visitInstances?.map(serializeInstance) ?? [],
});

const serializeSchedule = (s) => ({
  id: s.id,
  supervisorId: s.supervisorId,
  supervisor: serializeSupervisor(s.supervisor),
  year: s.year,
  month: s.month,
  publishedAt: s.publishedAt,
  scheduledVisits: s.scheduledVisits?.map(serializeScheduledVisit) ?? [],
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

/**
 * Cross-cutting validations for createSchedule / updateSchedule.
 * Throws on the first problem so the client sees one clear message.
 */
const ensureSupervisor = async (supervisorId) => {
  const u = await prisma.user.findFirst({
    where: { id: supervisorId, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!u) {
    throw ApiError.badRequest('Supervisor not found');
  }
  return u;
};

const ensureBranch = async (branchId) => {
  const b = await prisma.branch.findFirst({
    where: { id: branchId, deletedAt: null },
  });
  if (!b) {
    throw ApiError.badRequest(`Branch not found: ${branchId}`);
  }
  return b;
};

/**
 * Create a full monthly schedule for a supervisor in one transaction.
 *
 * Steps:
 *   1. Validate supervisor.
 *   2. Validate (supervisor, year, month) doesn't already have an active schedule.
 *   3. For each scheduledVisit input:
 *      - validate branch exists
 *      - validate firstVisitDate falls inside (year, month)
 *      - call distributeVisitDates() to compute V1..Vn dates
 *   4. Insert MonthlySchedule + N ScheduledVisits + sum(M_i) VisitInstances.
 *      One transaction — all-or-nothing.
 */
const createSchedule = async ({ supervisorId, year, month, publish, scheduledVisits }) => {
  await ensureSupervisor(supervisorId);

  const existing = await prisma.monthlySchedule.findFirst({
    where: { supervisorId, year, month, deletedAt: null },
  });
  if (existing) {
    throw ApiError.conflict('A schedule already exists for this supervisor and month');
  }

  // Validate every branch up front, in parallel — independent reads.
  await Promise.all(scheduledVisits.map((input) => ensureBranch(input.branchId)));

  // Compute distributions synchronously (no DB calls — pure validation/math).
  const computed = scheduledVisits.map((input) => {
    const first = new Date(input.firstVisitDate);
    if (first.getUTCFullYear() !== year || first.getUTCMonth() + 1 !== month) {
      throw ApiError.badRequest(
        `firstVisitDate ${input.firstVisitDate} is outside ${year}-${String(month).padStart(2, '0')}`,
      );
    }
    const dates = distributeVisitDates(input.numberOfVisits, first);
    return { input, first, dates };
  });

  const schedule = await prisma.$transaction(async (tx) => {
    const created = await tx.monthlySchedule.create({
      data: {
        supervisorId,
        year,
        month,
        publishedAt: publish ? new Date() : null,
      },
    });

    // Sequential is intentional: each iteration writes to the same
    // transaction. Parallelising inside a Prisma tx is not safe.
    for (const c of computed) {
      // eslint-disable-next-line no-await-in-loop
      const sv = await tx.scheduledVisit.create({
        data: {
          type: 'REGULAR',
          monthlyScheduleId: created.id,
          branchId: c.input.branchId,
          numberOfVisits: c.input.numberOfVisits,
          firstVisitDate: c.first,
        },
      });

      // eslint-disable-next-line no-await-in-loop
      await tx.visitInstance.createMany({
        data: c.dates.map((d, idx) => ({
          scheduledVisitId: sv.id,
          visitOrder: idx + 1,
          scheduledDate: d,
        })),
      });
    }

    return tx.monthlySchedule.findUnique({
      where: { id: created.id },
      include: {
        supervisor: true,
        scheduledVisits: {
          where: { deletedAt: null },
          include: {
            branch: true,
            visitInstances: {
              where: { deletedAt: null },
              orderBy: { visitOrder: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });

  logger.info(
    { scheduleId: schedule.id, supervisorId, year, month, branches: scheduledVisits.length },
    'Monthly schedule created',
  );
  return serializeSchedule(schedule);
};

const listSchedules = async ({ page, limit, supervisorId, year, month, published, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(supervisorId && { supervisorId }),
    ...(year !== undefined && { year }),
    ...(month !== undefined && { month }),
    ...(published === true && { publishedAt: { not: null } }),
    ...(published === false && { publishedAt: null }),
  };

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.monthlySchedule.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        supervisor: true,
        scheduledVisits: {
          where: { deletedAt: null },
          include: {
            branch: true,
            visitInstances: {
              where: { deletedAt: null },
              orderBy: { visitOrder: 'asc' },
            },
          },
        },
      },
    }),
    prisma.monthlySchedule.count({ where }),
  ]);

  return {
    items: items.map(serializeSchedule),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getSchedule = async (id) => {
  const schedule = await prisma.monthlySchedule.findFirst({
    where: { id, deletedAt: null },
    include: {
      supervisor: true,
      scheduledVisits: {
        where: { deletedAt: null },
        include: {
          branch: true,
          visitInstances: {
            where: { deletedAt: null },
            orderBy: { visitOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!schedule) {
    throw ApiError.notFound('Monthly schedule not found');
  }
  return serializeSchedule(schedule);
};

const updateSchedule = async (id, { publish }) => {
  const existing = await prisma.monthlySchedule.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound('Monthly schedule not found');
  }

  const data = {};
  if (publish === true && !existing.publishedAt) {
    data.publishedAt = new Date();
  } else if (publish === false && existing.publishedAt) {
    data.publishedAt = null;
  }

  if (Object.keys(data).length === 0) {
    return getSchedule(id);
  }

  await prisma.monthlySchedule.update({ where: { id }, data });
  logger.info({ scheduleId: id, publish }, 'Monthly schedule updated');
  return getSchedule(id);
};

/**
 * Soft delete cascades: schedule -> its scheduled visits -> their instances.
 * No hard deletes; everything is recoverable via deletedAt.
 */
const deleteSchedule = async (id) => {
  const existing = await prisma.monthlySchedule.findFirst({
    where: { id, deletedAt: null },
    include: {
      scheduledVisits: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!existing) {
    throw ApiError.notFound('Monthly schedule not found');
  }

  const scheduledVisitIds = existing.scheduledVisits.map((sv) => sv.id);
  const now = new Date();

  await prisma.$transaction([
    prisma.visitInstance.updateMany({
      where: { scheduledVisitId: { in: scheduledVisitIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.scheduledVisit.updateMany({
      where: { id: { in: scheduledVisitIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.monthlySchedule.update({
      where: { id },
      data: { deletedAt: now },
    }),
  ]);

  logger.info({ scheduleId: id }, 'Monthly schedule soft-deleted (cascade)');
};

module.exports = {
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
};

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const { logger } = require('../../utils/logger');
const { distributeVisitDates } = require('../../utils/scheduleDistribution');

/**
 * MonthlySchedule — produced by the "Assign Supervisor" flow described
 * in FRD §4.2.2.2.1 §3. Each ScheduledVisit references a RegionScheduling
 * (the standalone entity), NOT the legacy Branch table.
 */

const serializeSupervisor = (u) =>
  u ? { id: u.id, email: u.email, phone: u.phone, nameAr: u.nameAr, nameEn: u.nameEn } : null;

const serializeRegionScheduling = (rs) =>
  rs
    ? {
        id: rs.id,
        regionTitle: rs.regionTitle,
        companyName: rs.companyName,
        branchName: rs.branchName,
        categoryName: rs.categoryName,
        branchNumber: rs.branchNumber,
        city: rs.city,
        region: rs.region,
        code: rs.code,
        numberOfVisits: rs.numberOfVisits,
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
  regionSchedulingId: sv.regionSchedulingId,
  regionScheduling: serializeRegionScheduling(sv.regionScheduling),
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

const ensureSupervisor = async (supervisorId) => {
  const u = await prisma.user.findFirst({
    where: { id: supervisorId, role: 'SUPERVISOR', deletedAt: null },
  });
  if (!u) {
    throw ApiError.badRequest('Supervisor not found');
  }
  return u;
};

const ensureRegionScheduling = async (regionSchedulingId) => {
  const rs = await prisma.regionScheduling.findFirst({
    where: { id: regionSchedulingId, deletedAt: null },
  });
  if (!rs) {
    throw ApiError.badRequest(`Region scheduling not found: ${regionSchedulingId}`);
  }
  return rs;
};

/**
 * Pull the (year, month) shared by every date in a list. Throws if
 * they don't all sit in the same calendar month — a MonthlySchedule
 * is by definition single-month.
 */
const deriveYearMonth = (dates) => {
  const ref = dates[0];
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() + 1;
  for (const d of dates) {
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) {
      throw ApiError.badRequest(
        'All visit dates must fall in the same calendar month',
        {
          firstDate: ref.toISOString(),
          conflictingDate: d.toISOString(),
        },
      );
    }
  }
  return { year, month };
};

/**
 * Create a full monthly schedule for a supervisor — "Assign Supervisor"
 * flow.
 *
 * The admin sends one date globally (`applyToAllDate`) or per-branch
 * (`firstVisitDate`), or a mix (per-branch wins, applyToAllDate fills
 * the rest). The system:
 *   1. Resolves each branch's first-visit date.
 *   2. Derives (year, month) from the resolved dates and asserts they
 *      all fall in the same month.
 *   3. Reads `numberOfVisits` from each RegionScheduling — admin can't
 *      override it; that's an attribute of the branch itself.
 *   4. Generates V1..Vn dates via distributeVisitDates.
 *   5. Writes MonthlySchedule + ScheduledVisits + VisitInstances in
 *      one tx, with publishedAt = now (no draft mode).
 */
const createSchedule = async ({ supervisorId, applyToAllDate, scheduledVisits }) => {
  await ensureSupervisor(supervisorId);

  // Step 1: resolve each branch's firstVisitDate.
  const fallback = applyToAllDate ? new Date(applyToAllDate) : null;
  const resolvedDates = scheduledVisits.map((input, idx) => {
    const raw = input.firstVisitDate || fallback;
    if (!raw) {
      // Shouldn't happen — validator already enforces this.
      throw ApiError.badRequest(
        `scheduledVisits[${idx}] is missing a firstVisitDate and no applyToAllDate was set`,
      );
    }
    return new Date(raw);
  });

  // Step 2: derive year/month and validate same-month invariant.
  const { year, month } = deriveYearMonth(resolvedDates);

  const existing = await prisma.monthlySchedule.findFirst({
    where: { supervisorId, year, month, deletedAt: null },
  });
  if (existing) {
    throw ApiError.conflict('A schedule already exists for this supervisor and month');
  }

  // Step 3: validate every region scheduling up front, in parallel.
  const regionSchedulings = await Promise.all(
    scheduledVisits.map((input) => ensureRegionScheduling(input.regionSchedulingId)),
  );

  /**
   * FRD §4.2.2.2.1 §3 FR-89: a single RegionScheduling cannot live in
   * two supervisors' schedules in the same calendar month.
   */
  const requestedIds = scheduledVisits.map((sv) => sv.regionSchedulingId);
  const overlapping = await prisma.scheduledVisit.findMany({
    where: {
      regionSchedulingId: { in: requestedIds },
      deletedAt: null,
      monthlySchedule: { year, month, deletedAt: null },
    },
    include: {
      monthlySchedule: {
        include: { supervisor: { select: { id: true, nameAr: true } } },
      },
    },
  });
  if (overlapping.length > 0) {
    throw ApiError.conflict(
      'Some branches are already scheduled for this month under another supervisor',
      {
        conflicts: overlapping.map((sv) => ({
          regionSchedulingId: sv.regionSchedulingId,
          supervisorId: sv.monthlySchedule.supervisor.id,
          supervisorName: sv.monthlySchedule.supervisor.nameAr,
        })),
      },
    );
  }

  // Step 4: build per-branch plan — numberOfVisits comes from RS, not input.
  const computed = scheduledVisits.map((input, idx) => {
    const rs = regionSchedulings[idx];
    const first = resolvedDates[idx];
    const dates = distributeVisitDates(rs.numberOfVisits, first);
    return { input, first, dates, numberOfVisits: rs.numberOfVisits };
  });

  // Step 5: write everything atomically.
  const schedule = await prisma.$transaction(async (tx) => {
    const created = await tx.monthlySchedule.create({
      data: {
        supervisorId,
        year,
        month,
        publishedAt: new Date(),
      },
    });

    for (const c of computed) {
      // eslint-disable-next-line no-await-in-loop
      const sv = await tx.scheduledVisit.create({
        data: {
          type: 'REGULAR',
          monthlyScheduleId: created.id,
          regionSchedulingId: c.input.regionSchedulingId,
          numberOfVisits: c.numberOfVisits,
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
            regionScheduling: true,
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
    {
      scheduleId: schedule.id,
      supervisorId,
      year,
      month,
      branches: scheduledVisits.length,
    },
    'Monthly schedule created',
  );
  return serializeSchedule(schedule);
};

const listSchedules = async ({ page, limit, supervisorId, year, month, sort }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(supervisorId && { supervisorId }),
    ...(year !== undefined && { year }),
    ...(month !== undefined && { month }),
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
            regionScheduling: true,
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
          regionScheduling: true,
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
  deleteSchedule,
};

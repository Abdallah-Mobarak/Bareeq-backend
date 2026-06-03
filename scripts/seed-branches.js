/**
 * Demo data seed for the manager-portal Implemented Branches list,
 * Dashboard KPIs (FRD §3.12.1), Regional Reports (§3.12.2), and the
 * by-company report (§3.6).
 *
 * Creates a chain of:
 *   Company × 2  →  RegionScheduling × 8 (across 3 regions)
 *                   →  MonthlySchedule (current month)
 *                      →  ScheduledVisit per branch (REGULAR)
 *                         →  VisitInstance × numberOfVisits, with a
 *                            varied mix of statuses so the dashboard
 *                            shows real numbers and the regional
 *                            breakdown has > 1 row.
 *
 * Idempotent: re-running this script does NOT create duplicates. Each
 * RegionScheduling is keyed by (companyName, branchName, branchNumber);
 * if it already exists, the script reuses it. Same for the supervisor,
 * monthly schedule, scheduled visits, and visit instances.
 *
 * Usage:
 *   node scripts/seed-branches.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth() + 1;

/**
 * 8 branches spread across companies, regions, cities.
 * Each numberOfVisits drives how many V1..V4 instances we create per
 * branch this month.
 */
const BRANCHES = [
  // Carrefour KSA — Riyadh / North
  { companyName: 'Carrefour KSA', branchName: 'Carrefour Granada Mall',  categoryName: 'Hypermarket', branchNumber: 'CR-001', city: 'Riyadh',  region: 'North',   code: 'CFR-N-001', numberOfVisits: 4 },
  { companyName: 'Carrefour KSA', branchName: 'Carrefour Hayat Mall',    categoryName: 'Hypermarket', branchNumber: 'CR-002', city: 'Riyadh',  region: 'North',   code: 'CFR-N-002', numberOfVisits: 2 },
  // Carrefour KSA — Jeddah / Central
  { companyName: 'Carrefour KSA', branchName: 'Carrefour Red Sea Mall',  categoryName: 'Hypermarket', branchNumber: 'CR-003', city: 'Jeddah',  region: 'Central', code: 'CFR-C-001', numberOfVisits: 3 },
  { companyName: 'Carrefour KSA', branchName: 'Carrefour Tahlia',        categoryName: 'Express',     branchNumber: 'CR-004', city: 'Jeddah',  region: 'Central', code: 'CFR-C-002', numberOfVisits: 1 },
  // Lulu Hypermarket — Dammam / South
  { companyName: 'Lulu Hypermarket', branchName: 'Lulu Dhahran Mall',    categoryName: 'Hypermarket', branchNumber: 'LL-001', city: 'Dammam',  region: 'South',   code: 'LLU-S-001', numberOfVisits: 4 },
  { companyName: 'Lulu Hypermarket', branchName: 'Lulu Al Khobar',       categoryName: 'Hypermarket', branchNumber: 'LL-002', city: 'Khobar',  region: 'South',   code: 'LLU-S-002', numberOfVisits: 2 },
  // Lulu Hypermarket — Mecca / Central
  { companyName: 'Lulu Hypermarket', branchName: 'Lulu Mecca Mall',      categoryName: 'Hypermarket', branchNumber: 'LL-003', city: 'Mecca',   region: 'Central', code: 'LLU-C-001', numberOfVisits: 3 },
  // Lulu Hypermarket — Riyadh / North
  { companyName: 'Lulu Hypermarket', branchName: 'Lulu Olaya',           categoryName: 'Express',     branchNumber: 'LL-004', city: 'Riyadh',  region: 'North',   code: 'LLU-N-001', numberOfVisits: 1 },
];

/**
 * Status cycle so VisitInstances get a realistic mix:
 *   ~50% IMPLEMENTED, ~20% REMAINING, ~15% NOT_IMPLEMENTED,
 *   ~10% UNDERWAY, ~5% FINAL_CLOSED.
 *
 * We index into this array by (branch index × visitOrder) so the same
 * seed run always produces the same distribution — reproducible demo
 * data.
 */
const STATUS_CYCLE = [
  'IMPLEMENTED', 'IMPLEMENTED', 'IMPLEMENTED', 'IMPLEMENTED', 'IMPLEMENTED',
  'REMAINING', 'REMAINING',
  'NOT_IMPLEMENTED', 'NOT_IMPLEMENTED',
  'UNDERWAY',
  'IMPLEMENTED', 'IMPLEMENTED', 'IMPLEMENTED', 'IMPLEMENTED',
  'REMAINING',
  'NOT_IMPLEMENTED',
  'UNDERWAY',
  'FINAL_CLOSED',
  'IMPLEMENTED', 'REMAINING',
];

/**
 * Find or create a SUPERVISOR user. The MonthlySchedule needs one;
 * we don't care which — we just need a valid FK.
 */
const ensureSupervisor = async () => {
  const existing = await prisma.user.findFirst({
    where: { role: 'SUPERVISOR', deletedAt: null },
  });
  if (existing) {
    console.log(`Using existing supervisor: ${existing.email}`);
    return existing;
  }

  const passwordHash = await bcrypt.hash('Supervisor@123', 10);
  const created = await prisma.user.create({
    data: {
      email: 'demo-supervisor@bareeq.local',
      password: passwordHash,
      role: 'SUPERVISOR',
      nameAr: 'مشرف تجريبي',
      nameEn: 'Demo Supervisor',
      phone: '+966500000001',
    },
  });
  console.log(`Created supervisor: ${created.email}`);
  return created;
};

/**
 * Find or create a NotImplementedReason — VisitInstance rows with
 * status = NOT_IMPLEMENTED need a non-null FK to one of these.
 */
const ensureReason = async () => {
  const existing = await prisma.notImplementedReason.findFirst({
    where: { deletedAt: null },
  });
  if (existing) return existing;

  return prisma.notImplementedReason.create({
    data: {
      titleAr: 'الفرع مغلق',
      titleEn: 'Branch closed',
    },
  });
};

const ensureBranch = async (b) => {
  const existing = await prisma.regionScheduling.findFirst({
    where: {
      companyName: b.companyName,
      branchName: b.branchName,
      branchNumber: b.branchNumber,
      deletedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.regionScheduling.create({ data: b });
};

const ensureMonthlySchedule = async (supervisorId) => {
  const existing = await prisma.monthlySchedule.findFirst({
    where: { supervisorId, year: Y, month: M, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.monthlySchedule.create({
    data: {
      supervisorId,
      year: Y,
      month: M,
      publishedAt: new Date(),
    },
  });
};

const ensureScheduledVisit = async ({ monthlyScheduleId, regionSchedulingId, numberOfVisits }) => {
  const existing = await prisma.scheduledVisit.findFirst({
    where: {
      monthlyScheduleId,
      regionSchedulingId,
      type: 'REGULAR',
      deletedAt: null,
    },
  });
  if (existing) return existing;

  // First visit on the 5th of the current month — gives the frontend
  // a realistic date to render.
  const firstVisitDate = new Date(Date.UTC(Y, M - 1, 5));

  return prisma.scheduledVisit.create({
    data: {
      type: 'REGULAR',
      monthlyScheduleId,
      regionSchedulingId,
      numberOfVisits,
      firstVisitDate,
    },
  });
};

const ensureVisitInstance = async ({ scheduledVisitId, visitOrder, status, reasonId, scheduledDate }) => {
  const existing = await prisma.visitInstance.findFirst({
    where: { scheduledVisitId, visitOrder, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.visitInstance.create({
    data: {
      scheduledVisitId,
      visitOrder,
      scheduledDate,
      status,
      documentationStatus: status === 'IMPLEMENTED' ? 'DOCUMENTED' : 'UNDOCUMENTED',
      notImplementedReasonId: status === 'NOT_IMPLEMENTED' ? reasonId : null,
      startedAt: status === 'UNDERWAY' || status === 'IMPLEMENTED' ? new Date() : null,
      endedAt: status === 'IMPLEMENTED' ? new Date() : null,
    },
  });
};

const main = async () => {
  console.log(`Seeding manager-portal demo data for ${Y}-${String(M).padStart(2, '0')}...`);

  const supervisor = await ensureSupervisor();
  const reason = await ensureReason();
  const monthly = await ensureMonthlySchedule(supervisor.id);

  let branchesCreated = 0;
  let visitInstancesCreated = 0;
  let statusIdx = 0;

  for (let i = 0; i < BRANCHES.length; i += 1) {
    const b = BRANCHES[i];
    const branch = await ensureBranch(b);
    const sv = await ensureScheduledVisit({
      monthlyScheduleId: monthly.id,
      regionSchedulingId: branch.id,
      numberOfVisits: b.numberOfVisits,
    });

    // V1..VN visit instances, scheduled one week apart starting day 5.
    for (let v = 1; v <= b.numberOfVisits; v += 1) {
      const status = STATUS_CYCLE[statusIdx % STATUS_CYCLE.length];
      statusIdx += 1;

      const scheduledDate = new Date(Date.UTC(Y, M - 1, 5 + (v - 1) * 7));
      const before = await prisma.visitInstance.findFirst({
        where: { scheduledVisitId: sv.id, visitOrder: v, deletedAt: null },
      });
      await ensureVisitInstance({
        scheduledVisitId: sv.id,
        visitOrder: v,
        status,
        reasonId: reason.id,
        scheduledDate,
      });
      if (!before) visitInstancesCreated += 1;
    }
    branchesCreated += 1;
  }

  console.log('---');
  console.log(`Branches processed:    ${branchesCreated} (re-used if existing)`);
  console.log(`Visit instances seeded: ${visitInstancesCreated} new`);
  console.log(`Schedule period:        ${Y}-${String(M).padStart(2, '0')}`);
  console.log('---');
  console.log('Done. Hit GET /manager/branches and the dashboard endpoints should now return data.');
};

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

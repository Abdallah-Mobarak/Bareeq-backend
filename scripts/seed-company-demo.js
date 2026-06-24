/**
 * Demo data for the mobile COMPANY app, tied to a specific login account
 * (default: arab@gmail.com). Fills the Company dashboard, branches list,
 * branch detail, and monthly report (company-portal endpoints) with
 * branches + visits in a realistic mix of statuses so the tester sees
 * non-empty screens.
 *
 * Chain created:
 *   Company  ──nameAr──▶ RegionScheduling.companyName (text match, FRD §4.2.2.2.1)
 *   User (COMPANY_USER, companyId = Company.id)
 *   Supervisor + MonthlySchedule (current month)
 *     └─ ScheduledVisit per branch (REGULAR)
 *        └─ VisitInstance × numberOfVisits  (varied statuses + documentation)
 *
 * Account handling (safe + idempotent):
 *   - If the account already exists, its PASSWORD is left untouched; we only
 *     ensure role=COMPANY_USER, status=ENABLED, and link it to the company.
 *   - If it has a company already, we reuse it (branches match its nameAr).
 *   - If it doesn't exist, we create it with DEFAULT_PASSWORD and print it.
 *
 * Re-running never duplicates (RegionScheduling keyed by
 * companyName+branchName+branchNumber; visits by their unique keys).
 *
 * Usage:
 *   node scripts/seed-company-demo.js
 *   npm run seed:company-demo
 *
 * Override the target account / company via env if needed:
 *   COMPANY_DEMO_EMAIL=other@gmail.com node scripts/seed-company-demo.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const EMAIL = process.env.COMPANY_DEMO_EMAIL || 'arab@gmail.com';
const DEFAULT_PASSWORD = process.env.COMPANY_DEMO_PASSWORD || 'Company@123';
const COMPANY_NAME_AR = process.env.COMPANY_DEMO_NAME_AR || 'شركة العرب';
const COMPANY_NAME_EN = process.env.COMPANY_DEMO_NAME_EN || 'Arab Company';

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth() + 1;

/**
 * Branches for this company. companyName is injected from the resolved
 * Company.nameAr at runtime so the company-portal text match always lines up.
 */
const BRANCHES = [
  { branchName: 'فرع الرياض - العليا', categoryName: 'هايبر ماركت', branchNumber: 'AR-001', city: 'الرياض', region: 'الرياض', code: 'ARB-RYD-001', numberOfVisits: 4 },
  { branchName: 'فرع الرياض - النخيل', categoryName: 'سوبر ماركت', branchNumber: 'AR-002', city: 'الرياض', region: 'الرياض', code: 'ARB-RYD-002', numberOfVisits: 2 },
  { branchName: 'فرع جدة - التحلية', categoryName: 'هايبر ماركت', branchNumber: 'AR-003', city: 'جدة', region: 'مكة المكرمة', code: 'ARB-JED-001', numberOfVisits: 3 },
  { branchName: 'فرع جدة - الروضة', categoryName: 'إكسبريس', branchNumber: 'AR-004', city: 'جدة', region: 'مكة المكرمة', code: 'ARB-JED-002', numberOfVisits: 1 },
  { branchName: 'فرع الدمام - الشاطئ', categoryName: 'هايبر ماركت', branchNumber: 'AR-005', city: 'الدمام', region: 'المنطقة الشرقية', code: 'ARB-DMM-001', numberOfVisits: 4 },
  { branchName: 'فرع الخبر - العقربية', categoryName: 'سوبر ماركت', branchNumber: 'AR-006', city: 'الخبر', region: 'المنطقة الشرقية', code: 'ARB-KHB-001', numberOfVisits: 2 },
];

/**
 * Status mix so the dashboard/report show real numbers:
 *   ~50% IMPLEMENTED, ~20% REMAINING, ~15% NOT_IMPLEMENTED,
 *   ~10% UNDERWAY, ~5% FINAL_CLOSED. Indexed deterministically so a
 *   re-run produces the same picture.
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

/** Resolve (or create) the company + its COMPANY_USER login, without touching an existing password. */
const ensureCompanyAndUser = async () => {
  let user = await prisma.user.findFirst({ where: { email: EMAIL } });

  let company = null;
  if (user && user.companyId) {
    company = await prisma.company.findFirst({ where: { id: user.companyId, deletedAt: null } });
  }
  if (!company) {
    company =
      (await prisma.company.findFirst({ where: { nameAr: COMPANY_NAME_AR, deletedAt: null } })) ||
      (await prisma.company.create({
        data: { nameAr: COMPANY_NAME_AR, nameEn: COMPANY_NAME_EN, contactEmail: EMAIL },
      }));
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: passwordHash,
        role: 'COMPANY_USER',
        status: 'ENABLED',
        nameAr: COMPANY_NAME_AR,
        nameEn: COMPANY_NAME_EN,
        companyId: company.id,
      },
    });
    console.log(`Created COMPANY_USER ${EMAIL}  (password: ${DEFAULT_PASSWORD})`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'COMPANY_USER', status: 'ENABLED', companyId: company.id, deletedAt: null },
    });
    console.log(`Reused existing account ${EMAIL} — password left unchanged, linked to "${company.nameAr}"`);
  }

  return { user, company };
};

const ensureSupervisor = async () => {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPERVISOR', deletedAt: null } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash('Supervisor@123', 10);
  return prisma.user.create({
    data: {
      email: 'demo-supervisor@bareeq.local',
      password: passwordHash,
      role: 'SUPERVISOR',
      nameAr: 'مشرف تجريبي',
      nameEn: 'Demo Supervisor',
      phone: '+966500000001',
    },
  });
};

const DEFAULT_REASONS = [
  { titleAr: 'الفرع مغلق', titleEn: 'Branch closed' },
  { titleAr: 'أخرى', titleEn: 'Other' },
];

const ensureReason = async () => {
  let first = null;
  for (const r of DEFAULT_REASONS) {
    const existing = await prisma.notImplementedReason.findFirst({
      where: { titleEn: r.titleEn, deletedAt: null },
    });
    const row = existing || (await prisma.notImplementedReason.create({ data: r }));
    if (!first) first = row;
  }
  return first;
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
    data: { supervisorId, year: Y, month: M, publishedAt: new Date() },
  });
};

const ensureScheduledVisit = async ({ monthlyScheduleId, regionSchedulingId, numberOfVisits }) => {
  const existing = await prisma.scheduledVisit.findFirst({
    where: { monthlyScheduleId, regionSchedulingId, type: 'REGULAR', deletedAt: null },
  });
  if (existing) return existing;
  return prisma.scheduledVisit.create({
    data: {
      type: 'REGULAR',
      monthlyScheduleId,
      regionSchedulingId,
      numberOfVisits,
      firstVisitDate: new Date(Date.UTC(Y, M - 1, 5)),
    },
  });
};

const ensureVisitInstance = async ({ scheduledVisitId, visitOrder, status, reasonId, scheduledDate }) => {
  const existing = await prisma.visitInstance.findFirst({
    where: { scheduledVisitId, visitOrder, deletedAt: null },
  });
  if (existing) return false;

  const implemented = status === 'IMPLEMENTED';
  await prisma.visitInstance.create({
    data: {
      scheduledVisitId,
      visitOrder,
      scheduledDate,
      status,
      documentationStatus: implemented ? 'DOCUMENTED' : 'UNDOCUMENTED',
      notImplementedReasonId: status === 'NOT_IMPLEMENTED' ? reasonId : null,
      startedAt: status === 'UNDERWAY' || implemented ? new Date() : null,
      endedAt: implemented ? new Date() : null,
      durationSeconds: implemented ? 1800 : null,
      // Branch-manager documentation, so the detail screen shows real values.
      jobNumber: implemented ? `JOB-${visitOrder}${scheduledVisitId.slice(-4)}` : null,
      rating: implemented ? (visitOrder % 2 === 0 ? 5 : 4) : null,
      comments: implemented ? 'تمت الزيارة وتوثيقها بنجاح.' : null,
      documentedAt: implemented ? new Date() : null,
    },
  });
  return true;
};

const main = async () => {
  console.log(`Seeding COMPANY demo data for ${EMAIL} — ${Y}-${String(M).padStart(2, '0')}...`);

  const { company } = await ensureCompanyAndUser();
  const supervisor = await ensureSupervisor();
  const reason = await ensureReason();
  const monthly = await ensureMonthlySchedule(supervisor.id);

  let branchesProcessed = 0;
  let visitsCreated = 0;
  let statusIdx = 0;

  for (const base of BRANCHES) {
    // Inject the resolved company name so the company-portal text match lines up.
    const branch = await ensureBranch({ ...base, companyName: company.nameAr });
    const sv = await ensureScheduledVisit({
      monthlyScheduleId: monthly.id,
      regionSchedulingId: branch.id,
      numberOfVisits: base.numberOfVisits,
    });

    for (let v = 1; v <= base.numberOfVisits; v += 1) {
      const status = STATUS_CYCLE[statusIdx % STATUS_CYCLE.length];
      statusIdx += 1;
      const scheduledDate = new Date(Date.UTC(Y, M - 1, 5 + (v - 1) * 7));
      if (await ensureVisitInstance({ scheduledVisitId: sv.id, visitOrder: v, status, reasonId: reason.id, scheduledDate })) {
        visitsCreated += 1;
      }
    }
    branchesProcessed += 1;
  }

  console.log('---');
  console.log(`Company:          ${company.nameAr} (${company.id})`);
  console.log(`Branches:         ${branchesProcessed} (re-used if existing)`);
  console.log(`Visit instances:  ${visitsCreated} new`);
  console.log(`Period:           ${Y}-${String(M).padStart(2, '0')}`);
  console.log('---');
  console.log('Done. Log in as the company on mobile — dashboard / branches / monthly report should now show data.');
};

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

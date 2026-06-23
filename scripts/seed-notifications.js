/**
 * Idempotent seed: insert DEMO in-app notifications so the web dashboards
 * and mobile apps have data to render before the real event-driven flows
 * fire.
 *
 * Two notifications per user, chosen to match what that user's ROLE
 * actually receives in production (see notify() call sites). Types + data
 * payloads mirror the real ones so the frontend can build its routing /
 * deep-links against realistic shapes.
 *
 * Every demo row is tagged `data._demo = true`. On each run we delete all
 * previously-seeded demo notifications first, so re-running never piles up
 * duplicates and never touches real notifications.
 *
 * NOTE: the IDs inside `data` (disputeId, bookingId, ...) are placeholders
 * for UI rendering only — they don't point at real records, so deep-link
 * navigation will 404 until real data exists. That's expected for a demo.
 *
 * Usage:
 *   npm run seed:notifications
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const now = Date.now();
// Stagger createdAt a little so the list has a natural newest-first order.
const minutesAgo = (m) => new Date(now - m * 60 * 1000);

/**
 * Per-role templates. Each entry is { type, titleAr, titleEn, bodyAr,
 * bodyEn, data, read, ageMin }. `read` decides whether readAt is set (so
 * the frontend sees both states); `ageMin` staggers createdAt.
 */
const TEMPLATES = {
  ADMIN: [
    {
      type: 'DISPUTE_FILED',
      titleAr: 'شكوى جديدة من عميل',
      titleEn: 'New complaint from a customer',
      bodyAr: 'العميل قدّم شكوى بخصوص أحد الطلبات وتحتاج مراجعة.',
      bodyEn: 'A customer filed a complaint about a booking and it needs review.',
      data: { disputeId: 'demo-dispute-001', bookingId: 'demo-booking-001' },
      read: false,
      ageMin: 5,
    },
    {
      type: 'SYSTEM_ANNOUNCEMENT',
      titleAr: 'تحديث النظام',
      titleEn: 'System update',
      bodyAr: 'تم تحديث لوحة التحكم بمزايا جديدة.',
      bodyEn: 'The dashboard has been updated with new features.',
      data: {},
      read: true,
      ageMin: 180,
    },
  ],

  MARKETPLACE_ADMIN: [
    {
      type: 'WITHDRAWAL_SUBMITTED',
      titleAr: 'طلب سحب جديد',
      titleEn: 'New withdrawal request',
      bodyAr: 'مزوّد خدمة قدّم طلب سحب جديد بانتظار المراجعة.',
      bodyEn: 'A service provider submitted a new withdrawal request awaiting review.',
      data: { withdrawalId: 'demo-withdrawal-001', amount: '750.00' },
      read: false,
      ageMin: 10,
    },
    {
      type: 'DISPUTE_FILED',
      titleAr: 'شكوى جديدة من مزوّد خدمة',
      titleEn: 'New complaint from a service provider',
      bodyAr: 'مزوّد خدمة قدّم شكوى بخصوص أحد الطلبات.',
      bodyEn: 'A service provider filed a complaint about a booking.',
      data: { disputeId: 'demo-dispute-002', bookingId: 'demo-booking-002' },
      read: false,
      ageMin: 90,
    },
  ],

  MANAGER: [
    {
      type: 'ADDITIONAL_TASK_ASSIGNED',
      titleAr: 'مهمة إضافية جديدة',
      titleEn: 'New additional task',
      bodyAr: 'تم إسناد مهمة إضافية ضمن نطاق إدارتك.',
      bodyEn: 'An additional task was assigned within your scope.',
      data: { taskId: 'demo-task-001' },
      read: false,
      ageMin: 15,
    },
    {
      type: 'SYSTEM_ANNOUNCEMENT',
      titleAr: 'تعميم إداري',
      titleEn: 'Admin announcement',
      bodyAr: 'يرجى مراجعة الجداول الشهرية قبل نهاية الأسبوع.',
      bodyEn: 'Please review the monthly schedules before the end of the week.',
      data: {},
      read: true,
      ageMin: 240,
    },
  ],

  COMPANY_USER: [
    {
      type: 'SCHEDULE_PUBLISHED',
      titleAr: 'تم نشر الجدول الشهري',
      titleEn: 'Monthly schedule published',
      bodyAr: 'تم نشر جدول الزيارات لفروعك لهذا الشهر.',
      bodyEn: 'The visit schedule for your branches this month has been published.',
      data: { scheduleId: 'demo-schedule-001', year: 2026, month: 6 },
      read: false,
      ageMin: 20,
    },
    {
      type: 'VISIT_STATUS_CHANGED',
      titleAr: 'تم تنفيذ زيارة فرع',
      titleEn: 'Branch visit implemented',
      bodyAr: 'تم تنفيذ زيارة لأحد فروعك بنجاح.',
      bodyEn: 'A visit to one of your branches has been implemented.',
      data: {
        regionSchedulingId: 'demo-rs-001',
        visitInstanceId: 'demo-visit-001',
        visitOrder: 1,
        status: 'IMPLEMENTED',
      },
      read: true,
      ageMin: 300,
    },
  ],

  ACCOUNTANT_MANAGER: [
    {
      type: 'MONTHLY_REPORT_AVAILABLE',
      titleAr: 'التقرير الشهري جاهز',
      titleEn: 'Monthly report available',
      bodyAr: 'أصبح التقرير الشهري متاحًا للعرض.',
      bodyEn: 'The monthly report is now available to view.',
      data: { year: 2026, month: 6 },
      read: false,
      ageMin: 25,
    },
    {
      type: 'CONTACT_REPLIED',
      titleAr: 'رد الإدارة على رسالتك',
      titleEn: 'Admin replied to your message',
      bodyAr: 'قامت الإدارة بالرد على رسالتك في تواصل معنا.',
      bodyEn: 'The admin replied to your Contact-Us message.',
      data: { contactMessageId: 'demo-contact-001' },
      read: true,
      ageMin: 360,
    },
  ],

  CUSTOMER: [
    {
      type: 'BOOKING_ACCEPTED',
      titleAr: 'تم قبول طلبك',
      titleEn: 'Your booking has been accepted',
      bodyAr: 'قَبِل أحد مزوّدي الخدمة طلبك وسيبدأ قريبًا.',
      bodyEn: 'A service provider accepted your booking and will start soon.',
      data: { bookingId: 'demo-booking-010', serviceId: 'demo-service-001' },
      read: false,
      ageMin: 8,
    },
    {
      type: 'BOOKING_COMPLETED',
      titleAr: 'تم إنجاز الخدمة',
      titleEn: 'Service completed',
      bodyAr: 'تم إنجاز طلبك. يمكنك الآن تقييم الخدمة.',
      bodyEn: 'Your booking is complete. You can now rate the service.',
      data: { bookingId: 'demo-booking-011', serviceId: 'demo-service-002' },
      read: true,
      ageMin: 120,
    },
  ],

  SERVICE_PROVIDER: [
    {
      type: 'NEW_BOOKING_REQUEST',
      titleAr: 'طلب خدمة جديد',
      titleEn: 'New service request',
      bodyAr: 'وصل طلب جديد يطابق تخصصك.',
      bodyEn: 'A new request matching your service type is available.',
      data: { bookingId: 'demo-booking-020', serviceId: 'demo-service-003' },
      read: false,
      ageMin: 12,
    },
    {
      type: 'WITHDRAWAL_APPROVED',
      titleAr: 'تمت الموافقة على طلب السحب',
      titleEn: 'Withdrawal approved',
      bodyAr: 'تمت الموافقة على طلب السحب وتحويل المبلغ.',
      bodyEn: 'Your withdrawal request was approved and the amount transferred.',
      data: { withdrawalId: 'demo-withdrawal-020', amount: '500.00' },
      read: true,
      ageMin: 200,
    },
  ],
};

const main = async () => {
  // 1) Wipe previously-seeded demo notifications (idempotent re-runs).
  const wiped = await prisma.notification.deleteMany({
    where: { data: { path: ['_demo'], equals: true } },
  });
  console.log(`Removed ${wiped.count} old demo notification(s).`);

  let totalCreated = 0;

  // 2) For each role, attach its 2 templates to every active user.
  for (const [role, templates] of Object.entries(TEMPLATES)) {
    const users = await prisma.user.findMany({
      where: { role, deletedAt: null },
      select: { id: true },
    });

    if (users.length === 0) {
      console.log(`- ${role}: no users found, skipped.`);
      continue;
    }

    const rows = [];
    for (const user of users) {
      for (const t of templates) {
        rows.push({
          userId: user.id,
          type: t.type,
          titleAr: t.titleAr,
          titleEn: t.titleEn,
          bodyAr: t.bodyAr,
          bodyEn: t.bodyEn,
          data: { ...t.data, _demo: true },
          readAt: t.read ? minutesAgo(t.ageMin - 1) : null,
          createdAt: minutesAgo(t.ageMin),
        });
      }
    }

    const result = await prisma.notification.createMany({ data: rows });
    totalCreated += result.count;
    console.log(`- ${role}: ${users.length} user(s) × ${templates.length} = ${result.count} notifications.`);
  }

  console.log('---');
  console.log(`Done. Seeded ${totalCreated} demo notification(s).`);
  console.log('Re-run any time — old demo rows are wiped first (real ones untouched).');
};

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

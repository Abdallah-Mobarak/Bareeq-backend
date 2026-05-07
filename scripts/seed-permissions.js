/**
 * Idempotent seed: populate the static `permissions` catalog.
 *
 * The catalog is the source of truth for what an admin can pick from
 * when building a PermissionRole. Keys are mapped from the FRD:
 *   - §4.2.1.2 (Manager Permissions, pg. 65-66)
 *   - §4.2.3.2 (Admin Permissions, pg. 83-84)
 *
 * Safe to run repeatedly: each row is upserted by its unique `key`.
 * To remove a stale permission, do it manually in DB and update the
 * affected PermissionRoles — we never auto-delete here.
 *
 * Usage:
 *   npm run seed:permissions
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * The full catalog. Grouped by `module` so the admin UI can render
 * a section per module when building a role.
 *
 * Keys are SCREAMING_SNAKE_CASE. Modules are snake_case.
 *
 * Audience hint (in comments only):
 *   [M]   = naturally assignable to Manager roles
 *   [A]   = admin-only
 *   [M/A] = either
 */
const PERMISSION_CATALOG = [
  // 1. Management and Follow-up Teams [M/A]
  {
    module: 'teams_management',
    key: 'VIEW_TEAMS',
    descriptionAr: 'عرض قوائم الفرق',
    descriptionEn: 'View teams lists',
  },
  {
    module: 'teams_management',
    key: 'EXPORT_TEAMS',
    descriptionAr: 'تصدير تقارير الفرق (PDF/Excel)',
    descriptionEn: 'Export teams reports (PDF/Excel)',
  },

  // 2. Follow-Up and Manage Daily Visits [M/A]
  {
    module: 'daily_visits',
    key: 'VIEW_DAILY_VISITS',
    descriptionAr: 'عرض الزيارات اليومية',
    descriptionEn: 'View daily visits',
  },
  {
    module: 'daily_visits',
    key: 'EXPORT_DAILY_VISITS',
    descriptionAr: 'تصدير الزيارات اليومية (PDF/Excel)',
    descriptionEn: 'Export daily visits (PDF/Excel)',
  },

  // 3. Customer Tracking Management [M/A]
  {
    module: 'customer_tracking',
    key: 'VIEW_CUSTOMERS',
    descriptionAr: 'عرض قوائم العملاء',
    descriptionEn: 'View customer lists',
  },
  {
    module: 'customer_tracking',
    key: 'EXPORT_CUSTOMERS',
    descriptionAr: 'تصدير تقارير العملاء (PDF/Excel)',
    descriptionEn: 'Export customer reports (PDF/Excel)',
  },

  // 4. Implemented Branches Management [M/A]
  {
    module: 'implemented_branches',
    key: 'VIEW_IMPLEMENTED_BRANCHES',
    descriptionAr: 'عرض الفروع المنفذة',
    descriptionEn: 'View implemented branches',
  },
  {
    module: 'implemented_branches',
    key: 'DOWNLOAD_BRANCH_PDF',
    descriptionAr: 'تنزيل تقرير فرع كـ PDF',
    descriptionEn: 'Download branch PDF',
  },
  {
    module: 'implemented_branches',
    key: 'EXPORT_IMPLEMENTED_BRANCHES',
    descriptionAr: 'تصدير الفروع المنفذة (PDF/Excel)',
    descriptionEn: 'Export implemented branches (PDF/Excel)',
  },

  // 5. Monthly Reports Management [M/A]
  {
    module: 'monthly_reports',
    key: 'VIEW_MONTHLY_REPORTS',
    descriptionAr: 'عرض التقارير الشهرية',
    descriptionEn: 'View monthly reports',
  },
  {
    module: 'monthly_reports',
    key: 'EXPORT_MONTHLY_REPORTS',
    descriptionAr: 'تصدير التقارير الشهرية',
    descriptionEn: 'Export monthly reports',
  },

  // 6. Monthly Sales Management [M/A]
  {
    module: 'sales',
    key: 'VIEW_SALES',
    descriptionAr: 'عرض قوائم العملاء (المبيعات)',
    descriptionEn: 'View sales clients listing',
  },
  {
    module: 'sales',
    key: 'MANAGE_SALES',
    descriptionAr: 'إضافة/تعديل/حذف عملاء المبيعات',
    descriptionEn: 'Add, update, or delete sales clients',
  },
  {
    module: 'sales',
    key: 'VIEW_SALE_DETAILS',
    descriptionAr: 'عرض تفاصيل عميل المبيعات',
    descriptionEn: 'View sales client details',
  },
  {
    module: 'sales',
    key: 'EXPORT_SALES',
    descriptionAr: 'تصدير تقارير المبيعات',
    descriptionEn: 'Export sales reports',
  },

  // 7. Car Case Management [M/A]
  {
    module: 'car_cases',
    key: 'VIEW_CAR_CASES',
    descriptionAr: 'عرض قوائم حالات السيارات',
    descriptionEn: 'View car cases listing',
  },
  {
    module: 'car_cases',
    key: 'MANAGE_CAR_CASES',
    descriptionAr: 'إضافة/تعديل/حذف حالات السيارات',
    descriptionEn: 'Add, update, or delete car cases',
  },
  {
    module: 'car_cases',
    key: 'VIEW_CAR_CASE_DETAILS',
    descriptionAr: 'عرض تفاصيل حالة سيارة',
    descriptionEn: 'View car case details',
  },
  {
    module: 'car_cases',
    key: 'EXPORT_CAR_CASES',
    descriptionAr: 'تصدير تقارير حالات السيارات',
    descriptionEn: 'Export car case reports',
  },

  // 8. Additional Tasks Management [M/A]
  {
    module: 'additional_tasks',
    key: 'VIEW_ADDITIONAL_TASKS',
    descriptionAr: 'عرض المهام الإضافية',
    descriptionEn: 'View additional tasks listing',
  },
  {
    module: 'additional_tasks',
    key: 'MANAGE_ADDITIONAL_TASKS',
    descriptionAr: 'إضافة/تعديل/حذف المهام الإضافية',
    descriptionEn: 'Add, update, or delete additional tasks',
  },
  {
    module: 'additional_tasks',
    key: 'VIEW_ADDITIONAL_TASK_DETAILS',
    descriptionAr: 'عرض تفاصيل مهمة إضافية',
    descriptionEn: 'View additional task details',
  },
  {
    module: 'additional_tasks',
    key: 'EXPORT_ADDITIONAL_TASKS',
    descriptionAr: 'تصدير تقارير المهام الإضافية',
    descriptionEn: 'Export additional task reports',
  },

  // 9. Representatives Management [M/A]
  {
    module: 'representatives',
    key: 'VIEW_REPRESENTATIVES',
    descriptionAr: 'عرض المندوبين',
    descriptionEn: 'View representatives listing',
  },
  {
    module: 'representatives',
    key: 'MANAGE_REPRESENTATIVES',
    descriptionAr: 'إضافة/تعديل/حذف مندوبين',
    descriptionEn: 'Add, update, or delete representatives',
  },
  {
    module: 'representatives',
    key: 'VIEW_REPRESENTATIVE_DETAILS',
    descriptionAr: 'عرض تفاصيل مندوب',
    descriptionEn: 'View representative details',
  },
  {
    module: 'representatives',
    key: 'EXPORT_REPRESENTATIVES',
    descriptionAr: 'تصدير تقارير المندوبين',
    descriptionEn: 'Export representative reports',
  },

  // 10. Admin-only: Managers Management [A]
  {
    module: 'managers_admin',
    key: 'MANAGE_MANAGERS',
    descriptionAr: 'إضافة/تعديل/حذف المديرين',
    descriptionEn: 'Add, update, or delete managers',
  },
  {
    module: 'managers_admin',
    key: 'VIEW_MANAGER_DETAILS',
    descriptionAr: 'عرض تفاصيل المدير',
    descriptionEn: 'View manager details',
  },

  // 11. Admin-only: Tasks Management [A]
  {
    module: 'tasks_admin',
    key: 'MANAGE_TASKS',
    descriptionAr: 'إضافة/تعديل/حذف مهام المديرين',
    descriptionEn: 'Add, update, or delete manager tasks',
  },

  // 12. Admin-only: Supervisors Management [A]
  {
    module: 'supervisors_admin',
    key: 'MANAGE_SUPERVISORS',
    descriptionAr: 'إضافة/تعديل/حذف المشرفين',
    descriptionEn: 'Add, update, or delete supervisors',
  },
  {
    module: 'supervisors_admin',
    key: 'VIEW_SUPERVISOR_DETAILS',
    descriptionAr: 'عرض تفاصيل المشرف',
    descriptionEn: 'View supervisor details',
  },
  {
    module: 'supervisors_admin',
    key: 'MANAGE_MONTHLY_SCHEDULING',
    descriptionAr: 'إدارة الجداول الشهرية',
    descriptionEn: 'Manage monthly scheduling',
  },

  // 13. Admin-only: Reasons Management [A]
  {
    module: 'reasons_admin',
    key: 'MANAGE_REASONS',
    descriptionAr: 'إضافة/تعديل/حذف أسباب عدم التنفيذ',
    descriptionEn: 'Add, update, or delete not-implemented reasons',
  },

  // 14. Admin-only: Admins Management [A]
  {
    module: 'admins_admin',
    key: 'MANAGE_ADMINS',
    descriptionAr: 'إضافة/تعديل/حذف المسؤولين',
    descriptionEn: 'Add, update, or delete admins',
  },
  {
    module: 'admins_admin',
    key: 'VIEW_ADMIN_DETAILS',
    descriptionAr: 'عرض تفاصيل المسؤول',
    descriptionEn: 'View admin details',
  },

  // 15. Admin-only: User Contact Management [A]
  {
    module: 'contact_users',
    key: 'VIEW_MESSAGES',
    descriptionAr: 'عرض الرسائل من المستخدمين',
    descriptionEn: 'View user messages',
  },
  {
    module: 'contact_users',
    key: 'REPLY_MESSAGES',
    descriptionAr: 'الرد على رسائل المستخدمين',
    descriptionEn: 'Reply to user messages',
  },

  // 16. Admin-only: Notifications Management [A]
  {
    module: 'notifications',
    key: 'SEND_NOTIFICATIONS',
    descriptionAr: 'إرسال إشعارات للمستخدمين',
    descriptionEn: 'Send notifications to users',
  },
];

const main = async () => {
  console.log(`Seeding permissions catalog (${PERMISSION_CATALOG.length} entries)...`);

  let created = 0;
  let updated = 0;

  for (const perm of PERMISSION_CATALOG) {
    const existing = await prisma.permission.findUnique({ where: { key: perm.key } });

    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {
        descriptionAr: perm.descriptionAr,
        descriptionEn: perm.descriptionEn,
        module: perm.module,
      },
      create: perm,
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log('---');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Total in catalog: ${PERMISSION_CATALOG.length}`);
  console.log('---');
  console.log('Done.');
};

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

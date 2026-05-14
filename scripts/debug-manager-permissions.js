/**
 * Diagnostic — show every MANAGER in the DB, their PermissionRole,
 * and the permission keys actually attached to that role.
 *
 * Run:  node scripts/debug-manager-permissions.js
 *
 * Use this when a manager gets 403 from /manager/* — you'll see
 * exactly which keys they hold vs. which the route requires.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const REQUIRED_KEYS_BY_ROUTE = {
  'GET /manager/teams': 'VIEW_TEAMS',
  'GET /manager/teams/export.xlsx': 'EXPORT_TEAMS',
  'GET /manager/daily-visits': 'VIEW_DAILY_VISITS',
  'GET /manager/customer-tracking': 'VIEW_CUSTOMER_TRACKING',
  'GET /manager/branches': 'VIEW_IMPLEMENTED_BRANCHES',
  'GET /manager/monthly-reports': 'VIEW_MONTHLY_REPORTS_COMPANIES',
  'GET /manager/clients': 'VIEW_MONTHLY_SALES',
  'GET /manager/car-cases': 'VIEW_CAR_CASES',
  'GET /manager/representatives': 'VIEW_REPRESENTATIVES',
  'GET /manager/additional-tasks': 'VIEW_ADDITIONAL_TASKS_MANAGER',
};

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  // 1. Every permission key defined in the catalog
  const allPerms = await prisma.permission.findMany({ select: { key: true } });
  const allKeys = new Set(allPerms.map((p) => p.key));
  console.log(`\n📚 Total permissions seeded in DB: ${allKeys.size}`);

  // Sanity: does VIEW_TEAMS exist in the catalog at all?
  console.log(`   VIEW_TEAMS in catalog: ${allKeys.has('VIEW_TEAMS') ? '✅' : '❌  (run npm run seed:permissions)'}`);

  // 2. Every PermissionRole in the DB
  const roles = await prisma.permissionRole.findMany({
    where: { deletedAt: null },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      users: { select: { id: true, email: true, role: true, status: true, deletedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n🎭 Permission roles in DB: ${roles.length}\n`);
  for (const r of roles) {
    const keys = r.permissions.map((p) => p.permission.key).sort();
    console.log(`─── Role: "${r.name}" (id: ${r.id})`);
    console.log(`    Permissions (${keys.length}): ${keys.length ? keys.join(', ') : '(none)'}`);
    const liveUsers = r.users.filter((u) => !u.deletedAt);
    console.log(`    Users on this role (${liveUsers.length}):`);
    if (liveUsers.length === 0) {
      console.log(`      (none)`);
    }
    for (const u of liveUsers) {
      console.log(`      - ${pad(u.email, 35)} role=${u.role}, status=${u.status}`);
    }
    console.log();
  }

  // 3. Every MANAGER with their role + held keys
  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER', deletedAt: null },
    include: {
      permissionRole: {
        include: { permissions: { select: { permission: { select: { key: true } } } } },
      },
    },
  });

  console.log(`\n👤 Managers in DB: ${managers.length}\n`);
  for (const m of managers) {
    console.log(`─── ${m.email}  (status: ${m.status})`);
    if (!m.permissionRoleId) {
      console.log(`    ❌ NO permissionRoleId — every /manager/* call will 403 with`);
      console.log(`       "No permission role assigned. Contact your administrator."`);
      console.log();
      continue;
    }
    if (!m.permissionRole) {
      console.log(`    ❌ permissionRoleId points to a deleted/missing role`);
      console.log(`       "Your permission role no longer exists."`);
      console.log();
      continue;
    }
    const heldKeys = new Set(m.permissionRole.permissions.map((p) => p.permission.key));
    console.log(`    PermissionRole: "${m.permissionRole.name}"  (${heldKeys.size} keys)`);
    console.log(`    Held keys: ${[...heldKeys].sort().join(', ') || '(none)'}`);
    console.log();
    console.log(`    Route access check:`);
    for (const [route, requiredKey] of Object.entries(REQUIRED_KEYS_BY_ROUTE)) {
      const has = heldKeys.has(requiredKey);
      console.log(
        `      ${has ? '✅' : '❌'}  ${pad(route, 45)} needs ${requiredKey}`,
      );
    }
    console.log();
  }

  await prisma.$disconnect();
})();

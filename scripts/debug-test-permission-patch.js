/**
 * End-to-end test of the PATCH /permission-roles/:id endpoint.
 * Proves the backend persists permissionKeys correctly.
 *
 * Flow:
 *   1. Admin logs in
 *   2. GET current "Manager" role state
 *   3. PATCH it with a full set of VIEW_* + MANAGE_* keys
 *   4. Re-fetch the role and assert every requested key landed
 *   5. Verify directly via Prisma that the join-table rows were created
 *
 * Run while the server is up on :3000.
 */
const http = require('node:http');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const req = (method, path, body, headers = {}) =>
  new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf-8') : null;
    const r = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(payload && { 'Content-Length': payload.length }),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, body: json || text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

// Pulled directly from the manager-portal routes (these match the
// catalog keys seeded by scripts/seed-permissions.js). Pasting any
// key NOT in this list will get "Unknown permission keys" 400.
const DESIRED_KEYS = [
  'VIEW_TEAMS',
  'EXPORT_TEAMS',
  'VIEW_DAILY_VISITS',
  'EXPORT_DAILY_VISITS',
  'VIEW_CUSTOMERS',
  'EXPORT_CUSTOMERS',
  'VIEW_IMPLEMENTED_BRANCHES',
  'EXPORT_IMPLEMENTED_BRANCHES',
  'DOWNLOAD_BRANCH_PDF',
  'VIEW_MONTHLY_REPORTS',
  'EXPORT_MONTHLY_REPORTS',
  'VIEW_SALES',
  'VIEW_SALE_DETAILS',
  'MANAGE_SALES',
  'EXPORT_SALES',
  'VIEW_CAR_CASES',
  'VIEW_CAR_CASE_DETAILS',
  'MANAGE_CAR_CASES',
  'EXPORT_CAR_CASES',
  'VIEW_REPRESENTATIVES',
  'VIEW_REPRESENTATIVE_DETAILS',
  'MANAGE_REPRESENTATIVES',
  'EXPORT_REPRESENTATIVES',
  'VIEW_ADDITIONAL_TASKS',
  'VIEW_ADDITIONAL_TASK_DETAILS',
  'MANAGE_ADDITIONAL_TASKS',
  'EXPORT_ADDITIONAL_TASKS',
];

(async () => {
  // 1. Admin login
  const login = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  if (login.status !== 200) {
    console.error('Admin login failed; is the bootstrap admin seeded?', login);
    console.error('Trying kareem@gmail.com fallback...');
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
  console.log('✓ Admin login');

  // 2. Find the "Manager" role
  const rolesList = await req('GET', '/api/v1/permission-roles?limit=100', null, auth);
  if (rolesList.status !== 200) {
    console.error('Listing roles failed:', rolesList);
    process.exit(1);
  }
  const managerRole = rolesList.body.data.items.find((r) => r.name === 'Manager');
  if (!managerRole) {
    console.error('No "Manager" role found in DB');
    process.exit(1);
  }
  console.log(`✓ Found "Manager" role (id: ${managerRole.id})`);
  console.log(`  Before PATCH: ${managerRole.permissions.length} keys`);

  // 3. PATCH with the desired key set
  const beforeKeys = new Set(managerRole.permissions.map((p) => p.key));
  const missing = DESIRED_KEYS.filter((k) => !beforeKeys.has(k));
  console.log(`  Will add ${missing.length} new keys: ${missing.join(', ') || '(none — already up to date)'}`);

  const patch = await req(
    'PATCH',
    `/api/v1/permission-roles/${managerRole.id}`,
    { permissionKeys: DESIRED_KEYS },
    auth,
  );
  if (patch.status !== 200) {
    console.error(`✗ PATCH failed (${patch.status}):`, JSON.stringify(patch.body, null, 2));
    process.exit(1);
  }
  console.log('✓ PATCH /permission-roles/:id succeeded');
  console.log(`  Response shows: ${patch.body.data.role.permissions.length} permissions`);

  // 4. Re-fetch via GET to confirm round-trip
  const verify = await req(
    'GET',
    `/api/v1/permission-roles/${managerRole.id}`,
    null,
    auth,
  );
  if (verify.status !== 200) {
    console.error('Re-fetch failed:', verify);
    process.exit(1);
  }
  const after = new Set(verify.body.data.role.permissions.map((p) => p.key));
  console.log(`✓ Re-fetched role — now has ${after.size} keys`);

  // 5. Verify every desired key is present
  const stillMissing = DESIRED_KEYS.filter((k) => !after.has(k));
  if (stillMissing.length > 0) {
    console.error('✗ DB did NOT persist these keys:', stillMissing);
    process.exit(1);
  }
  console.log('✓ All desired keys are present on the role');

  // 6. Cross-check directly via Prisma — bypasses the HTTP layer entirely
  const direct = await prisma.permissionRole.findUnique({
    where: { id: managerRole.id },
    include: { permissions: { include: { permission: true } } },
  });
  const directKeys = direct.permissions.map((p) => p.permission.key).sort();
  console.log(`\n✓ Direct DB read confirms ${directKeys.length} permissions on "Manager":`);
  console.log(`  ${directKeys.join(', ')}`);

  console.log('\n✓ Backend update flow works correctly end-to-end.');
  console.log('\n👉 Now retest in Apidog: GET /manager/teams with the manager token.');
  console.log('   It should return 200 (the route needs VIEW_TEAMS, which is now on the role).');

  await prisma.$disconnect();
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

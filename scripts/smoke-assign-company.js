/* eslint-disable no-console */
/**
 * End-to-end smoke test للـ assign-company flow الجديد:
 *  1. login admin
 *  2. create 2 region_schedulings same companyName
 *  3. dropdown should list it (hasLogin=false)
 *  4. branches both isAssigned=false
 *  5. first POST /assign-company (login + AM1 → branch1)
 *  6. dropdown still lists it (hasLogin=true, unassignedBranches=1)
 *  7. branches: branch1 isAssigned=true, branch2 isAssigned=false
 *  8. second POST /assign-company (no login, just AM2 → branch2)
 *  9. dropdown now empty (fully assigned)
 */

const BASE = 'http://localhost:3000/api/v1';
let token = '';

const j = async (method, path, body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
};

const log = (label, result) => {
  console.log(`\n--- ${label} (${result.status}) ---`);
  console.log(JSON.stringify(result.data, null, 2));
};

const main = async () => {
  // 1. login
  let r = await j('POST', '/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  if (r.status !== 200) {
    console.error('Login failed', JSON.stringify(r, null, 2));
    return;
  }
  console.log('login response:', JSON.stringify(r.data, null, 2));
  token = r.data.data?.tokens?.accessToken
    || r.data.data?.accessToken
    || r.data.accessToken;
  if (!token) { console.error('no token'); return; }
  console.log('1. ✅ admin logged in');

  // 2. create 2 region schedulings for "TestCo"
  const branch1 = await j('POST', '/region-schedulings', {
    companyName: 'TestCo',
    branchName: 'TestCo Branch 1',
    city: 'Cairo',
    region: 'Downtown',
    numberOfVisits: 1,
    requiredTasks: [{ visitType: 1, titleAr: 'مهمة 1' }],
  });
  const branch2 = await j('POST', '/region-schedulings', {
    companyName: 'TestCo',
    branchName: 'TestCo Branch 2',
    city: 'Cairo',
    region: 'Maadi',
    numberOfVisits: 1,
    requiredTasks: [{ visitType: 1, titleAr: 'مهمة 1' }],
  });
  if (branch1.status !== 201 || branch2.status !== 201) {
    log('branch1', branch1);
    log('branch2', branch2);
    return;
  }
  const branch1Id =
    branch1.data.data?.id || branch1.data.data?.regionScheduling?.id;
  const branch2Id =
    branch2.data.data?.id || branch2.data.data?.regionScheduling?.id;
  if (!branch1Id || !branch2Id) {
    console.log('branch1 raw:', JSON.stringify(branch1.data, null, 2).slice(0, 300));
    return;
  }
  console.log('2. ✅ created 2 branches:', branch1Id, branch2Id);

  // 3. dropdown
  log('3. /available-companies (expect TestCo, hasLogin=false)', await j(
    'GET',
    '/assign-company/available-companies',
  ));

  // 4. branches
  log('4. /branches?companyName=TestCo (expect 2 unassigned)', await j(
    'GET',
    '/assign-company/branches?companyName=TestCo',
  ));

  // 5. first POST /assign-company
  const first = await j('POST', '/assign-company', {
    companyName: 'TestCo',
    loginDetails: {
      email: 'testco.login@example.com',
      phone: '+201111000001',
      password: 'TestCo@12345',
    },
    accountantManagers: [
      {
        email: 'am.testco1@example.com',
        phone: '+201222000001',
        password: 'Am@12345',
        nameAr: 'AM 1',
        assignedToAllBranches: false,
        regionSchedulingIds: [branch1Id],
      },
    ],
  });
  log('5. POST /assign-company (login + AM1)', first);

  // 6. dropdown should still list (hasLogin=true, unassigned=1)
  log('6. /available-companies (expect TestCo, hasLogin=true, unassigned=1)', await j(
    'GET',
    '/assign-company/available-companies',
  ));

  // 7. branches
  log('7. /branches?companyName=TestCo (branch1 assigned, branch2 free)', await j(
    'GET',
    '/assign-company/branches?companyName=TestCo',
  ));

  // 8. second POST /assign-company — no loginDetails
  const second = await j('POST', '/assign-company', {
    companyName: 'TestCo',
    accountantManagers: [
      {
        email: 'am.testco2@example.com',
        phone: '+201222000002',
        password: 'Am@12345',
        nameAr: 'AM 2',
        assignedToAllBranches: false,
        regionSchedulingIds: [branch2Id],
      },
    ],
  });
  log('8. POST /assign-company (no login, just AM2)', second);

  // 9. dropdown should now be empty
  log('9. /available-companies (expect TestCo gone, fully assigned)', await j(
    'GET',
    '/assign-company/available-companies',
  ));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

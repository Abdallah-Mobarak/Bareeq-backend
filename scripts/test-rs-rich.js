/* eslint-disable no-console */
/**
 * Build a realistic test: branch with Company + AMs + Schedule, then
 * call GET /region-schedulings/:id and show the rich response.
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
  return { status: res.status, data: await res.json() };
};

const stamp = Date.now();
const company = `RichCo-${stamp}`;

const main = async () => {
  const login = await j('POST', '/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  token = login.data.data.accessToken;

  // 1. Create supervisor
  const sup = await j('POST', '/supervisors', {
    email: `richsup.${stamp}@x.com`,
    phone: `+9665000${String(stamp).slice(-5)}`,
    password: 'Sup@12345',
    nameAr: 'سوبر فايزر',
  });
  const supId = sup.data.data.supervisor?.id || sup.data.data.id;

  // 2. Create 2 branches for company
  const mk = (n, m) =>
    j('POST', '/region-schedulings', {
      companyName: company,
      branchName: n,
      city: 'Riyadh',
      region: 'C',
      numberOfVisits: m,
      requiredTasks: Array.from({ length: m }, (_, i) => ({
        visitType: i + 1,
        titleAr: `T${i + 1}`,
      })),
    });
  const b1 = await mk('Rich Branch 1', 2);
  const b2 = await mk('Rich Branch 2', 2);
  const b1Id = b1.data.data?.id || b1.data.data?.regionScheduling?.id;
  const b2Id = b2.data.data?.id || b2.data.data?.regionScheduling?.id;

  // 3. Assign company + AM1 covering branch1
  const a1 = await j('POST', '/assign-company', {
    companyName: company,
    loginDetails: {
      email: `${company.toLowerCase()}.login@x.com`,
      phone: `+9665100${String(stamp).slice(-5)}`,
      password: 'Co@12345',
    },
    accountantManagers: [
      {
        email: `am1.${stamp}@x.com`,
        phone: `+9665200${String(stamp).slice(-5)}`,
        password: 'Am@12345',
        nameAr: 'محاسب 1',
        assignedToAllBranches: false,
        regionSchedulingIds: [b1Id],
      },
    ],
  });
  console.log('assign-company:', a1.status);

  // 4. Schedule supervisor for branch1 in Aug
  const sched = await j('POST', '/monthly-schedules', {
    supervisorId: supId,
    applyToAllDate: '2026-08-05',
    scheduledVisits: [{ regionSchedulingId: b1Id }],
  });
  console.log('monthly-schedules:', sched.status);

  // 5. GET branch1 detail
  const detail = await j('GET', `/region-schedulings/${b1Id}`);
  console.log(`\nGET /region-schedulings/${b1Id} (${detail.status})`);
  console.log(JSON.stringify(detail.data, null, 2));
};

main().catch((e) => console.error(e));

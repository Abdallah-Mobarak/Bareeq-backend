/* eslint-disable no-console */
/**
 * Smoke test: new POST /monthly-schedules shape.
 *
 * Verifies:
 *   - applyToAllDate fallback works for branches without their own date
 *   - per-branch firstVisitDate overrides applyToAllDate
 *   - numberOfVisits is read from RegionScheduling, not the input
 *   - year/month derived; publishedAt always set
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

const stamp = Date.now();

const main = async () => {
  // Login
  const login = await j('POST', '/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  if (login.status !== 200) {
    console.error('Login failed', login);
    return;
  }
  token = login.data.data.accessToken;
  console.log('1. ✅ admin logged in');

  // Create a supervisor
  const sup = await j('POST', '/supervisors', {
    email: `sup.${stamp}@example.com`,
    phone: `+201230${String(stamp).slice(-6)}`,
    password: 'Sup@12345',
    nameAr: 'مشرف اختبار',
    nameEn: 'Test Sup',
  });
  if (sup.status !== 201) {
    console.error('Supervisor create failed', sup);
    return;
  }
  const supId = sup.data.data.supervisor?.id || sup.data.data.id;
  console.log('2. ✅ supervisor created:', supId);

  // Create 3 branches under "SmokeCo" with different numberOfVisits
  const company = `SmokeCo-${stamp}`;
  const mkBranch = (name, n) =>
    j('POST', '/region-schedulings', {
      companyName: company,
      branchName: name,
      city: 'Cairo',
      region: 'Test',
      numberOfVisits: n,
      requiredTasks: Array.from({ length: n }, (_, i) => ({
        visitType: i + 1,
        titleAr: `مهمة V${i + 1}`,
      })),
    });
  const b1 = await mkBranch('Branch A', 2);
  const b2 = await mkBranch('Branch B', 3);
  const b3 = await mkBranch('Branch C', 1);
  const ids = [
    b1.data.data?.id || b1.data.data?.regionScheduling?.id,
    b2.data.data?.id || b2.data.data?.regionScheduling?.id,
    b3.data.data?.id || b3.data.data?.regionScheduling?.id,
  ];
  if (ids.some((x) => !x)) {
    console.error('Branch create failed', { b1, b2, b3 });
    return;
  }
  console.log('3. ✅ branches created (numberOfVisits = 2, 3, 1):', ids);

  // The body the user will test
  const body = {
    supervisorId: supId,
    applyToAllDate: '2026-06-05',
    scheduledVisits: [
      { regionSchedulingId: ids[0] },
      { regionSchedulingId: ids[1], firstVisitDate: '2026-06-12' },
      { regionSchedulingId: ids[2] },
    ],
  };
  console.log('\n--- BODY ---');
  console.log(JSON.stringify(body, null, 2));

  const r = await j('POST', '/monthly-schedules', body);
  console.log(`\n--- RESPONSE (${r.status}) ---`);
  console.log(JSON.stringify(r.data, null, 2));

  if (r.status !== 201) {
    return;
  }

  const sched = r.data.data.schedule;
  console.log('\n--- SUMMARY ---');
  console.log(`year/month derived: ${sched.year}/${sched.month}`);
  console.log(`publishedAt: ${sched.publishedAt}`);
  for (const sv of sched.scheduledVisits) {
    console.log(
      `  • ${sv.regionScheduling.branchName} (numberOfVisits=${sv.numberOfVisits}, firstVisitDate=${sv.firstVisitDate})`,
    );
    for (const inst of sv.instances) {
      console.log(`      V${inst.visitOrder} → ${inst.scheduledDate}`);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

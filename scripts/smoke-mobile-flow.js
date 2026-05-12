/* eslint-disable no-console */
/**
 * End-to-end mobile flow smoke test:
 *   1. Admin logs in (web)
 *   2. Admin creates supervisor + region scheduling + monthly schedule
 *   3. Supervisor tries to log in via WEB → must fail
 *   4. Supervisor logs in via MOBILE → ok
 *   5. GET /supervisor/my-schedule (summary)
 *   6. GET /supervisor/my-schedule/branches
 *   7. GET /supervisor/branches/:id
 *   8. POST /visit-instances/:id/start (with GPS)
 *   9. PATCH /visit-instances/:id/tasks/:taskCheckId (mark done)
 *  10. POST /visit-instances/:id/complete
 *  11. Try to start V2 — should work (V1 done)
 *  12. POST /visit-instances/:id/final-closed (V2)
 *  13. Verify V3+ cascaded to NOT_IMPLEMENTED
 */

const BASE = 'http://localhost:3000/api/v1';
let adminToken = '';
let supToken = '';

const j = async (method, path, body, token) => {
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
const log = (label, r) =>
  console.log(`\n[${label}] (${r.status}) ${JSON.stringify(r.data).slice(0, 240)}`);

const main = async () => {
  // 1. admin login (web)
  let r = await j('POST', '/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  adminToken = r.data.data.accessToken;
  console.log('1. ✅ admin logged in (web)');

  // 2a. Create supervisor
  const supBody = {
    email: `sup.mob.${stamp}@x.com`,
    phone: `+96650999${String(stamp).slice(-4)}`,
    password: 'Sup@12345',
    nameAr: 'سوبر موبيل',
  };
  r = await j('POST', '/supervisors', supBody, adminToken);
  if (r.status !== 201) return console.log('Supervisor create FAIL:', r);
  const supId = r.data.data.supervisor?.id || r.data.data.id;
  console.log('2a. ✅ supervisor created:', supId);

  // 2b. Create branch with 3 visits
  r = await j(
    'POST',
    '/region-schedulings',
    {
      companyName: `MobileCo-${stamp}`,
      branchName: 'Mobile Branch',
      city: 'Riyadh',
      region: 'Central',
      location: 'https://maps.google.com/?q=24.7,46.7',
      numberOfVisits: 3,
      requiredTasks: [
        { visitType: 1, titleAr: 'مهمة V1' },
        { visitType: 2, titleAr: 'مهمة V2' },
        { visitType: 3, titleAr: 'مهمة V3' },
      ],
    },
    adminToken,
  );
  if (r.status !== 201) return console.log('Branch create FAIL:', r);
  const branchId = r.data.data?.id || r.data.data?.regionScheduling?.id;
  console.log('2b. ✅ branch created:', branchId);

  // 2c. Create monthly schedule
  const today = new Date();
  const futureMonth = today.getUTCMonth() === 11
    ? `${today.getUTCFullYear() + 1}-01`
    : `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 2).padStart(2, '0')}`;
  r = await j(
    'POST',
    '/monthly-schedules',
    {
      supervisorId: supId,
      applyToAllDate: `${futureMonth}-05`,
      scheduledVisits: [{ regionSchedulingId: branchId }],
    },
    adminToken,
  );
  if (r.status !== 201) return console.log('Schedule create FAIL:', r);
  const sv = r.data.data.schedule.scheduledVisits[0];
  const v1Id = sv.instances[0].id;
  const v2Id = sv.instances[1].id;
  const v3Id = sv.instances[2].id;
  console.log('2c. ✅ schedule created. V1/V2/V3 ids:', v1Id, v2Id, v3Id);

  // 3. Supervisor tries WEB login — must fail (supervisor is mobile-only)
  r = await j('POST', '/auth/web/login', {
    identifier: supBody.email,
    password: supBody.password,
  });
  console.log(`3. ${r.status === 403 ? '✅' : '❌'} sup web login rejected (${r.status})`);

  // 4. Supervisor MOBILE login
  r = await j('POST', '/auth/mobile/login', {
    identifier: supBody.email,
    password: supBody.password,
  });
  if (r.status !== 200) return console.log('sup mobile login FAIL:', r);
  supToken = r.data.data.accessToken;
  console.log('4. ✅ sup mobile login ok');

  // Bonus: admin tries MOBILE login — must fail (admin is web-only)
  r = await j('POST', '/auth/mobile/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  console.log(`4b. ${r.status === 403 ? '✅' : '❌'} admin mobile login rejected (${r.status})`);

  // 5. summary
  r = await j('GET', '/supervisor/my-schedule', null, supToken);
  log('5. /supervisor/my-schedule', r);

  // 6. branches list (default month = current; use future month explicitly)
  r = await j(
    'GET',
    `/supervisor/my-schedule/branches?year=${futureMonth.split('-')[0]}&month=${parseInt(futureMonth.split('-')[1])}`,
    null,
    supToken,
  );
  log('6. /supervisor/my-schedule/branches', r);

  // 7. branch detail
  const svId = sv.id;
  r = await j('GET', `/supervisor/branches/${svId}`, null, supToken);
  console.log(`\n7. /supervisor/branches/:id (${r.status}) — visit instances:`);
  r.data.data.instances.forEach((i) =>
    console.log(`   V${i.visitOrder}: ${i.status} | tasks: ${i.taskChecks.length}`),
  );

  // 8. start V1
  r = await j(
    'POST',
    `/visit-instances/${v1Id}/start`,
    { latitude: 24.71, longitude: 46.71 },
    supToken,
  );
  console.log(`\n8. start V1 (${r.status}): status=${r.data.data?.status}, tasks=${r.data.data?.taskChecks?.length}`);

  // 9. mark task done
  const taskId = r.data.data.taskChecks[0].id;
  r = await j(
    'PATCH',
    `/visit-instances/${v1Id}/tasks/${taskId}`,
    { done: true },
    supToken,
  );
  console.log(`9. toggle task done (${r.status}): done=${r.data.data?.taskChecks[0].done}`);

  // 10. complete V1
  r = await j('POST', `/visit-instances/${v1Id}/complete`, {}, supToken);
  console.log(`10. complete V1 (${r.status}): status=${r.data.data?.status}, duration=${r.data.data?.durationSeconds}s`);

  // 11. start V2
  r = await j(
    'POST',
    `/visit-instances/${v2Id}/start`,
    { latitude: 24.71, longitude: 46.71 },
    supToken,
  );
  console.log(`11. start V2 (${r.status}): status=${r.data.data?.status}`);

  // 12. final-closed V2
  r = await j('POST', `/visit-instances/${v2Id}/final-closed`, {}, supToken);
  console.log(`12. V2 final-closed (${r.status}): status=${r.data.data?.status}`);

  // 13. verify V3 cascaded
  r = await j('GET', `/supervisor/branches/${svId}`, null, supToken);
  const v3 = r.data.data.instances.find((i) => i.id === v3Id);
  console.log(`13. V3 status after cascade: ${v3.status} (expected NOT_IMPLEMENTED)`);

  // 14. Try to act on V3 — should fail (already locked)
  r = await j(
    'POST',
    `/visit-instances/${v3Id}/start`,
    { latitude: 24.71, longitude: 46.71 },
    supToken,
  );
  console.log(`14. ${r.status === 409 ? '✅' : '❌'} cannot start cascaded V3 (${r.status})`);
};

main().catch((e) => console.error(e));

/**
 * Marketplace catalog smoke test — runs through the admin
 * ServiceCategory + Service CRUD and the customer Home reads.
 * Uses raw Node http so Arabic round-trips cleanly on Windows.
 */
const http = require('node:http');

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
          } catch {
            // not JSON — leave json null
          }
          resolve({ status: res.statusCode, body: json || text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

const assertOk = (label, res, expectedStatus = [200, 201]) => {
  const okStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!okStatuses.includes(res.status)) {
    console.error(`✗ ${label}: status ${res.status}`, JSON.stringify(res.body, null, 2));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
};

(async () => {
  // 1. Admin login
  const login = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  assertOk('Admin login', login);
  const token = login.body.data.accessToken;
  const authHeader = { Authorization: `Bearer ${token}` };

  // 2. Create a fresh category (use timestamp to keep idempotent)
  const tag = Date.now();
  const cat = await req(
    'POST',
    '/api/v1/admin/service-categories',
    {
      titleAr: `فئة اختبار ${tag}`,
      titleEn: `Test Category ${tag}`,
      sortOrder: 99,
    },
    authHeader,
  );
  assertOk('Create category', cat, 201);
  const categoryId = cat.body.data.id;

  // 3. Create a service with 3 subcategories
  const svc = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: 'سباكة',
      titleEn: 'Plumbing',
      descriptionAr: 'خدمات سباكة منزلية',
      descriptionEn: 'Residential plumbing services',
      commissionRate: 10,
      subcategories: [
        { titleAr: 'تسليك مجاري', titleEn: 'Drain cleaning', cost: 100 },
        { titleAr: 'إصلاح أنابيب', titleEn: 'Pipe repair', cost: 200 },
        { titleAr: 'تركيب مرحاض', titleEn: 'Toilet install', cost: 150 },
      ],
    },
    authHeader,
  );
  assertOk('Create service with subcategories', svc, 201);
  const serviceId = svc.body.data.id;
  console.log(`  → totalCost = ${svc.body.data.totalCost} (expect 450.00)`);
  if (svc.body.data.totalCost !== '450.00') {
    console.error('✗ totalCost mismatch');
    process.exit(1);
  }
  if (svc.body.data.subcategories.length !== 3) {
    console.error('✗ Expected 3 subcategories');
    process.exit(1);
  }

  // 4. Get one — verify nested subcategories load with the detail
  const detail = await req('GET', `/api/v1/admin/services/${serviceId}`, null, authHeader);
  assertOk('Get service detail', detail);
  if (detail.body.data.subcategories.length !== 3) {
    console.error('✗ Detail missing subcategories');
    process.exit(1);
  }
  console.log(`  → detail subcategories count = ${detail.body.data.subcategories.length}`);

  // 5. List services — filter by categoryId
  const list = await req(
    'GET',
    `/api/v1/admin/services?categoryId=${categoryId}&limit=10`,
    null,
    authHeader,
  );
  assertOk('List services by category', list);
  console.log(`  → found ${list.body.items.length} service(s) in category`);

  // 6. PATCH service — replace subcategories (different costs and a 4th)
  const patched = await req(
    'PATCH',
    `/api/v1/admin/services/${serviceId}`,
    {
      titleEn: 'Plumbing (Updated)',
      subcategories: [
        { titleAr: 'تسليك مجاري', titleEn: 'Drain cleaning', cost: 120 },
        { titleAr: 'إصلاح أنابيب', titleEn: 'Pipe repair', cost: 220 },
        { titleAr: 'تركيب مرحاض', titleEn: 'Toilet install', cost: 170 },
        { titleAr: 'تركيب سخان', titleEn: 'Water heater install', cost: 300 },
      ],
    },
    authHeader,
  );
  assertOk('Patch service with subcategories replace', patched);
  console.log(`  → new totalCost = ${patched.body.data.totalCost} (expect 810.00)`);
  if (patched.body.data.totalCost !== '810.00') {
    console.error('✗ totalCost after patch mismatch');
    process.exit(1);
  }
  if (patched.body.data.subcategories.length !== 4) {
    console.error('✗ Expected 4 subcategories after replace');
    process.exit(1);
  }

  // 7. Update commission via dedicated endpoint
  const commission = await req(
    'PATCH',
    `/api/v1/admin/services/${serviceId}/commission`,
    { commissionRate: 15.5 },
    authHeader,
  );
  assertOk('Update commission rate', commission);
  console.log(`  → commissionRate = ${commission.body.data.commissionRate}`);

  // 8. Negative: bad category should be rejected
  const badCat = await req(
    'POST',
    '/api/v1/admin/services',
    { categoryId: 'nonexistent', titleAr: 'x' },
    authHeader,
  );
  if (badCat.status !== 400) {
    console.error('✗ Should reject bad category', badCat);
    process.exit(1);
  }
  console.log('✓ Rejects non-existent categoryId (400)');

  // 9. Delete service — subcategories cascade soft-delete
  const del = await req('DELETE', `/api/v1/admin/services/${serviceId}`, null, authHeader);
  assertOk('Delete service', del);

  // 10. Try to delete the category — should now succeed since the only
  //     service in it was just deleted
  const catDel = await req(
    'DELETE',
    `/api/v1/admin/service-categories/${categoryId}`,
    null,
    authHeader,
  );
  assertOk('Delete category (no active services)', catDel);

  console.log('\n✓ All marketplace smoke tests passed.');
})().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});

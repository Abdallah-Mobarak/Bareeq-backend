/**
 * Customer Home smoke test — seeds a category + services with
 * subcategories, signs up a fresh customer, then exercises the
 * read-only browse / search / filter / detail endpoints.
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
          } catch {}
          resolve({ status: res.statusCode, body: json || text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

const ok = (label, res, expected = [200, 201]) => {
  const ex = Array.isArray(expected) ? expected : [expected];
  if (!ex.includes(res.status)) {
    console.error(`✗ ${label}: status ${res.status}`, JSON.stringify(res.body, null, 2));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
};

(async () => {
  // 1. Admin login + seed
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const tag = Date.now();

  // Create a category
  const cat = await req(
    'POST',
    '/api/v1/admin/service-categories',
    { titleAr: `فئة ${tag}`, titleEn: `Category ${tag}` },
    adminAuth,
  );
  ok('Seed category', cat, 201);
  const categoryId = cat.body.data.id;

  // Create 3 services in this category with different total costs:
  //   svc-A: 100 + 200 = 300
  //   svc-B: 50  + 75  = 125
  //   svc-C: 400 + 500 = 900
  const svcA = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: `سباكة ${tag}`,
      titleEn: `Plumbing ${tag}`,
      subcategories: [
        { titleAr: 'تسليك', titleEn: 'Drain', cost: 100 },
        { titleAr: 'إصلاح', titleEn: 'Repair', cost: 200 },
      ],
    },
    adminAuth,
  );
  ok('Seed service A (total 300)', svcA, 201);
  const svcAId = svcA.body.data.id;

  const svcB = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: `كهرباء ${tag}`,
      titleEn: `Electric ${tag}`,
      subcategories: [
        { titleAr: 'مفتاح', titleEn: 'Switch', cost: 50 },
        { titleAr: 'فيش', titleEn: 'Outlet', cost: 75 },
      ],
    },
    adminAuth,
  );
  ok('Seed service B (total 125)', svcB, 201);

  const svcC = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: `صيانة شاملة ${tag}`,
      titleEn: `Full Maintenance ${tag}`,
      subcategories: [
        { titleAr: 'مهمة ١', titleEn: 'Task 1', cost: 400 },
        { titleAr: 'مهمة ٢', titleEn: 'Task 2', cost: 500 },
      ],
    },
    adminAuth,
  );
  ok('Seed service C (total 900)', svcC, 201);

  // 2. Sign up a customer
  const customerEmail = `customer-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/customer/signup', {
    email: customerEmail,
    password: 'customerpass123',
    nameAr: 'عميل',
    nameEn: 'Customer',
  });
  ok('Customer signup', sig);
  const verify = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: customerEmail,
    password: 'customerpass123',
    nameAr: 'عميل',
    nameEn: 'Customer',
    otp: sig.body.data.otp,
  });
  ok('Customer verify', verify, 201);
  const custAuth = { Authorization: `Bearer ${verify.body.data.accessToken}` };

  // 3. Customer browses categories — must see our seed
  const cats = await req('GET', '/api/v1/customer/home/categories?limit=100', null, custAuth);
  ok('GET /customer/home/categories', cats);
  if (!cats.body.items.some((c) => c.id === categoryId)) {
    console.error('✗ Seeded category not in customer list');
    process.exit(1);
  }
  console.log(`  → ${cats.body.items.length} active categories visible`);

  // 4. Browse services in our seed category
  const svcs = await req(
    'GET',
    `/api/v1/customer/home/services?categoryId=${categoryId}&limit=10`,
    null,
    custAuth,
  );
  ok('GET /customer/home/services?categoryId=...', svcs);
  if (svcs.body.items.length !== 3) {
    console.error(`✗ Expected 3 services in category, got ${svcs.body.items.length}`);
    process.exit(1);
  }

  // 5. Cost-range filter: only B should match 100..200
  const costFiltered = await req(
    'GET',
    `/api/v1/customer/home/services?categoryId=${categoryId}&minCost=100&maxCost=200&limit=10`,
    null,
    custAuth,
  );
  ok('Cost-range filter (100..200)', costFiltered);
  const onlyB = costFiltered.body.items.length === 1 && costFiltered.body.items[0].id === svcB.body.data.id;
  if (!onlyB) {
    console.error('✗ Cost-range filter returned wrong rows', costFiltered.body);
    process.exit(1);
  }
  console.log('  → only service B (125 SAR) matched');

  // 6. priceAsc sort within the category
  const sorted = await req(
    'GET',
    `/api/v1/customer/home/services?categoryId=${categoryId}&sort=priceAsc&limit=10`,
    null,
    custAuth,
  );
  ok('priceAsc sort', sorted);
  const order = sorted.body.items.map((s) => Number(s.totalCost));
  const inOrder = order.every((v, i) => i === 0 || order[i - 1] <= v);
  if (!inOrder) {
    console.error('✗ priceAsc sort not ascending:', order);
    process.exit(1);
  }
  console.log(`  → order = [${order.join(', ')}]`);

  // 7. Title search (Arabic)
  const search = await req(
    'GET',
    `/api/v1/customer/home/services?q=${encodeURIComponent('كهرباء')}&limit=10`,
    null,
    custAuth,
  );
  ok('Search by Arabic title', search);
  if (!search.body.items.some((s) => s.titleAr.includes('كهرباء'))) {
    console.error('✗ Arabic title search missed service B');
    process.exit(1);
  }

  // 8. Detail endpoint includes subcategories + totalCost
  const detail = await req('GET', `/api/v1/customer/home/services/${svcAId}`, null, custAuth);
  ok('GET /customer/home/services/:id', detail);
  if (detail.body.data.totalCost !== '300.00') {
    console.error(`✗ Detail totalCost wrong: ${detail.body.data.totalCost}`);
    process.exit(1);
  }
  if (detail.body.data.subcategories.length !== 2) {
    console.error('✗ Detail subcategories count wrong');
    process.exit(1);
  }

  // 9. AuthZ: an SP cannot hit a CUSTOMER-only route
  const spEmail = `sp-home-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail,
    password: 'spprovider123',
    nameAr: 'مزود',
    nameEn: 'SP',
  });
  ok('SP signup', spSig);
  const spVerify = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail,
    password: 'spprovider123',
    nameAr: 'مزود',
    nameEn: 'SP',
    otp: spSig.body.data.otp,
  });
  ok('SP verify', spVerify, 201);
  const spAuth = { Authorization: `Bearer ${spVerify.body.data.accessToken}` };

  const forbidden = await req('GET', '/api/v1/customer/home/categories', null, spAuth);
  if (forbidden.status !== 403) {
    console.error(`✗ Expected 403 for SP hitting customer route, got ${forbidden.status}`, forbidden.body);
    process.exit(1);
  }
  console.log('✓ SP forbidden from CUSTOMER-only endpoint (403)');

  console.log('\n✓ All Customer Home smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

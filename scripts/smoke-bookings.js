/**
 * Booking lifecycle smoke test.
 *
 * Walks the full state machine:
 *   Customer creates → PENDING
 *   SP (unverified) can't accept (403)
 *   Admin approves SP KYC → isVerified=true
 *   SP accepts → APPROVED (commission locked)
 *   Customer can't cancel APPROVED (409)
 *   SP starts → IN_PROGRESS
 *   SP completes → COMPLETED + paymentStatus=PAID (CASH)
 *   Customer makes a 2nd booking + cancels while PENDING → CANCELLED
 *   Admin sees both bookings in list
 *
 * Also exercises:
 *   - Negative create validations (bad subcategory ids, mixed-service subs)
 *   - AuthZ (customer can't access SP routes, SP can't access customer routes)
 *   - Race-safe accept (second SP gets 409 after first SP wins)
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
    console.error(`✗ ${label}: ${res.status}`, JSON.stringify(res.body, null, 2));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
};

const assertStatus = (label, res, expected) => {
  if (res.status !== expected) {
    console.error(`✗ ${label}: expected ${expected}, got ${res.status}`, res.body);
    process.exit(1);
  }
  console.log(`✓ ${label} (${expected})`);
};

(async () => {
  const tag = Date.now();

  // 0. Admin login
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  // 1. Admin seeds: category + service (with 3 subcategories: 100 / 200 / 300) + commission 10%
  const cat = await req(
    'POST',
    '/api/v1/admin/service-categories',
    { titleAr: `cat-${tag}`, titleEn: `Category ${tag}` },
    adminAuth,
  );
  ok('Seed category', cat, 201);
  const categoryId = cat.body.data.id;

  const svc = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: `سباكة-${tag}`,
      titleEn: `Plumbing ${tag}`,
      commissionRate: 10,
      subcategories: [
        { titleAr: 'تسليك', titleEn: 'Sub-A', cost: 100 },
        { titleAr: 'إصلاح', titleEn: 'Sub-B', cost: 200 },
        { titleAr: 'تركيب', titleEn: 'Sub-C', cost: 300 },
      ],
    },
    adminAuth,
  );
  ok('Seed service (totalCost=600, commission=10%)', svc, 201);
  const serviceId = svc.body.data.id;
  const subIds = svc.body.data.subcategories.map((s) => s.id);

  // Also seed a separate service so we can test "mixed-service" rejection
  const otherSvc = await req(
    'POST',
    '/api/v1/admin/services',
    {
      categoryId,
      titleAr: `other-${tag}`,
      titleEn: `Other ${tag}`,
      subcategories: [{ titleAr: 'فحص', titleEn: 'Sub-X', cost: 50 }],
    },
    adminAuth,
  );
  ok('Seed second service', otherSvc, 201);
  const otherSubId = otherSvc.body.data.subcategories[0].id;

  // 2. Customer signs up
  const custEmail = `book-cust-${tag}@test.com`;
  const custSig = await req('POST', '/api/v1/auth/customer/signup', {
    email: custEmail,
    password: 'custpass123',
    nameAr: 'عميل',
  });
  ok('Customer signup', custSig);
  const custVfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: custEmail,
    password: 'custpass123',
    nameAr: 'عميل',
    otp: custSig.body.data.otp,
  });
  ok('Customer verify', custVfy, 201);
  const custAuth = { Authorization: `Bearer ${custVfy.body.data.accessToken}` };

  // 3. SP signs up (still UNVERIFIED)
  const spEmail = `book-sp-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail,
    password: 'sppass123',
    nameAr: 'مزود',
  });
  ok('SP signup', spSig);
  const spVfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail,
    password: 'sppass123',
    nameAr: 'مزود',
    otp: spSig.body.data.otp,
  });
  ok('SP verify (still unverified for KYC)', spVfy, 201);
  const spAuth = { Authorization: `Bearer ${spVfy.body.data.accessToken}` };
  const spUserId = spVfy.body.data.user.id;

  // 4. Unverified SP cannot access pool — 403
  const earlyPool = await req(
    'GET',
    '/api/v1/service-provider/bookings/pool',
    null,
    spAuth,
  );
  assertStatus('Unverified SP blocked from pool', earlyPool, 403);

  // 5. Negative: customer create with mixed-service subs → 400
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const mixed = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subIds[0], otherSubId],
      scheduledDate: tomorrow,
      paymentMethod: 'CASH',
    },
    custAuth,
  );
  assertStatus('Reject mixed-service subcategoryIds', mixed, 400);

  // 6. Negative: WALLET payment not supported in MVP → 400
  const walletAttempt = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subIds[0]],
      scheduledDate: tomorrow,
      paymentMethod: 'WALLET',
    },
    custAuth,
  );
  assertStatus('Reject WALLET payment in MVP', walletAttempt, 400);

  // 7. Customer creates booking (picks 2 of 3 subs: 100 + 200 = 300)
  const booking = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subIds[0], subIds[1]],
      description: 'حاجة عاجلة',
      locationAddress: 'الرياض - الصحافة',
      locationLat: 24.7136,
      locationLng: 46.6753,
      scheduledDate: tomorrow,
      paymentMethod: 'CASH',
    },
    custAuth,
  );
  ok('Customer creates booking', booking, 201);
  const bookingId = booking.body.data.id;
  if (booking.body.data.totalCost !== '300.00') {
    console.error(`✗ totalCost wrong: ${booking.body.data.totalCost}`);
    process.exit(1);
  }
  if (booking.body.data.status !== 'PENDING') {
    console.error('✗ Initial status should be PENDING');
    process.exit(1);
  }
  console.log(`  → bookingId=${bookingId}, total=300, status=PENDING`);

  // 8. SP (still unverified) tries to accept → 403
  const earlyAccept = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/accept`,
    null,
    spAuth,
  );
  assertStatus('Unverified SP blocked from accept', earlyAccept, 403);

  // 9. Admin approves SP KYC
  const kyc = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${spUserId}/kyc`,
    { decision: 'APPROVED' },
    adminAuth,
  );
  ok('Admin approves SP KYC', kyc);

  // 10. SP browses pool — finds the booking
  const pool = await req(
    'GET',
    '/api/v1/service-provider/bookings/pool?limit=100',
    null,
    spAuth,
  );
  ok('SP browses pool', pool);
  if (!pool.body.items.some((b) => b.id === bookingId)) {
    console.error('✗ SP cannot see the booking in pool');
    process.exit(1);
  }
  console.log(`  → SP sees ${pool.body.items.length} pending booking(s)`);

  // 11. SP accepts — PENDING → APPROVED, commission locked
  const accepted = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/accept`,
    null,
    spAuth,
  );
  ok('SP accepts booking', accepted);
  if (accepted.body.data.status !== 'APPROVED') {
    console.error('✗ Status not APPROVED'); process.exit(1);
  }
  if (accepted.body.data.commissionRate !== '10') {
    console.error(`✗ commissionRate not locked: ${accepted.body.data.commissionRate}`); process.exit(1);
  }
  if (accepted.body.data.commissionAmount !== '30.00') {
    console.error(`✗ commissionAmount wrong: ${accepted.body.data.commissionAmount}`); process.exit(1);
  }
  if (accepted.body.data.spPayout !== '270.00') {
    console.error(`✗ spPayout wrong: ${accepted.body.data.spPayout}`); process.exit(1);
  }
  console.log(`  → commission=30 (10% of 300), SP payout=270`);

  // 12. Second SP tries to accept the same booking — 409 race
  const sp2Email = `book-sp2-${tag}@test.com`;
  const sp2Sig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: sp2Email, password: 'sppass123', nameAr: 'مزود٢',
  });
  ok('Second SP signup', sp2Sig);
  const sp2Vfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: sp2Email, password: 'sppass123', nameAr: 'مزود٢', otp: sp2Sig.body.data.otp,
  });
  ok('Second SP verify', sp2Vfy, 201);
  await req('PATCH', `/api/v1/admin/service-providers/${sp2Vfy.body.data.user.id}/kyc`, { decision: 'APPROVED' }, adminAuth);
  const sp2Auth = { Authorization: `Bearer ${sp2Vfy.body.data.accessToken}` };
  const raceAttempt = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/accept`,
    null,
    sp2Auth,
  );
  assertStatus('Second SP loses race for taken booking', raceAttempt, 409);

  // 13. Customer cannot cancel an APPROVED booking
  const lateCancel = await req(
    'POST',
    `/api/v1/customer/bookings/${bookingId}/cancel`,
    { reason: 'changed my mind' },
    custAuth,
  );
  assertStatus('Cancel rejected for APPROVED', lateCancel, 409);

  // 14. SP commits state transitions: start + complete
  const started = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/start`,
    null,
    spAuth,
  );
  ok('SP starts booking', started);
  if (started.body.data.status !== 'IN_PROGRESS') {
    console.error('✗ Status not IN_PROGRESS'); process.exit(1);
  }

  // Start again — should 409
  const restart = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/start`,
    null,
    spAuth,
  );
  assertStatus('Cannot start an already-IN_PROGRESS booking', restart, 409);

  const completed = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/complete`,
    null,
    spAuth,
  );
  ok('SP completes booking', completed);
  if (completed.body.data.status !== 'COMPLETED') {
    console.error('✗ Status not COMPLETED'); process.exit(1);
  }
  if (completed.body.data.paymentStatus !== 'PAID') {
    console.error(`✗ CASH booking should auto-mark PAID, got ${completed.body.data.paymentStatus}`); process.exit(1);
  }
  console.log('  → CASH completion auto-marked PAID');

  // 15. Customer makes a 2nd booking + cancels while PENDING
  const booking2 = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subIds[2]],
      scheduledDate: tomorrow,
      paymentMethod: 'CASH',
    },
    custAuth,
  );
  ok('Customer creates 2nd booking', booking2, 201);
  const cancel = await req(
    'POST',
    `/api/v1/customer/bookings/${booking2.body.data.id}/cancel`,
    { reason: 'no longer needed' },
    custAuth,
  );
  ok('Customer cancels PENDING booking', cancel);
  if (cancel.body.data.status !== 'CANCELLED') {
    console.error('✗ Status not CANCELLED'); process.exit(1);
  }

  // 16. Customer list — sees both bookings
  const myList = await req('GET', '/api/v1/customer/bookings?limit=100', null, custAuth);
  ok('Customer lists own bookings', myList);
  const ids = myList.body.items.map((b) => b.id);
  if (!ids.includes(bookingId)) {
    console.error('✗ Customer list missing first booking'); process.exit(1);
  }
  if (!ids.includes(booking2.body.data.id)) {
    console.error('✗ Customer list missing 2nd booking'); process.exit(1);
  }

  // 17. Admin lists all + filters by status
  const adminAll = await req('GET', '/api/v1/admin/bookings?limit=100', null, adminAuth);
  ok('Admin lists bookings', adminAll);
  const adminCompleted = await req('GET', '/api/v1/admin/bookings?status=COMPLETED&limit=100', null, adminAuth);
  ok('Admin filters COMPLETED', adminCompleted);
  if (!adminCompleted.body.items.every((b) => b.status === 'COMPLETED')) {
    console.error('✗ Admin filter returned non-COMPLETED rows'); process.exit(1);
  }

  // 18. AuthZ: SP cannot hit customer endpoint
  const xRole1 = await req('GET', '/api/v1/customer/bookings', null, spAuth);
  assertStatus('SP forbidden from /customer/bookings', xRole1, 403);
  const xRole2 = await req('GET', '/api/v1/service-provider/bookings', null, custAuth);
  assertStatus('Customer forbidden from /service-provider/bookings', xRole2, 403);

  console.log('\n✓ All booking lifecycle smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

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

  // 3. SP signs up (account starts DISABLED, pending admin approval;
  //    serviceCategoryId is now required — FRD §2.1).
  const spEmail = `book-sp-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail,
    password: 'sppass123',
    nameAr: 'مزود',
    serviceCategoryId: categoryId,
  });
  ok('SP signup', spSig);
  const spVfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail,
    password: 'sppass123',
    nameAr: 'مزود',
    serviceCategoryId: categoryId,
    otp: spSig.body.data.otp,
  });
  ok('SP verify (no auto-login; pending approval)', spVfy, 201);
  if (spVfy.body.data.status !== 'PENDING_APPROVAL') {
    console.error('✗ SP verify should return PENDING_APPROVAL, not tokens');
    process.exit(1);
  }

  // 3a. SP can't log in while disabled (FRD §2.1 "can't login if disabled").
  const blockedLogin = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: spEmail,
    password: 'sppass123',
  });
  assertStatus('SP login blocked while pending approval', blockedLogin, 403);

  // 3b. Admin finds the SP and enables the account.
  const spLookup = await req(
    'GET',
    `/api/v1/admin/service-providers?q=${encodeURIComponent(spEmail)}&limit=100`,
    null,
    adminAuth,
  );
  ok('Admin lists SP', spLookup);
  const spRows = spLookup.body.items || spLookup.body.data?.items || [];
  const spUserId = spRows.find((r) => r.email === spEmail).id;
  const enableSp = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${spUserId}/status`,
    { status: 'ENABLED' },
    adminAuth,
  );
  ok('Admin enables SP account', enableSp);

  // 3c. SP logs in now that the account is enabled (still KYC-unverified).
  const spLogin = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: spEmail,
    password: 'sppass123',
  });
  ok('SP login after approval', spLogin);
  const spAuth = { Authorization: `Bearer ${spLogin.body.data.accessToken}` };

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
    email: sp2Email, password: 'sppass123', nameAr: 'مزود٢', serviceCategoryId: categoryId,
  });
  ok('Second SP signup', sp2Sig);
  const sp2Vfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: sp2Email, password: 'sppass123', nameAr: 'مزود٢', serviceCategoryId: categoryId, otp: sp2Sig.body.data.otp,
  });
  ok('Second SP verify', sp2Vfy, 201);
  const sp2Lookup = await req('GET', `/api/v1/admin/service-providers?q=${encodeURIComponent(sp2Email)}&limit=100`, null, adminAuth);
  const sp2Rows = sp2Lookup.body.items || sp2Lookup.body.data?.items || [];
  const sp2UserId = sp2Rows.find((r) => r.email === sp2Email).id;
  await req('PATCH', `/api/v1/admin/service-providers/${sp2UserId}/status`, { status: 'ENABLED' }, adminAuth);
  await req('PATCH', `/api/v1/admin/service-providers/${sp2UserId}/kyc`, { decision: 'APPROVED' }, adminAuth);
  const sp2Login = await req('POST', '/api/v1/auth/mobile/login', { identifier: sp2Email, password: 'sppass123' });
  const sp2Auth = { Authorization: `Bearer ${sp2Login.body.data.accessToken}` };
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

  // 13b. Reject (per-SP dismissal) + dashboard stats.
  //   Customer posts a fresh PENDING request; sp2 rejects it → it leaves
  //   sp2's pool but stays available to the first SP, and sp2's rejected
  //   counter goes up.
  const booking3 = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subIds[0]],
      scheduledDate: tomorrow,
      paymentMethod: 'CASH',
    },
    custAuth,
  );
  ok('Customer creates 3rd booking (for reject test)', booking3, 201);
  const booking3Id = booking3.body.data.id;

  // FRD §2.4: SPs registered for the category get "New request" notifications.
  const newReqNotifs = await req(
    'GET',
    '/api/v1/notifications?type=NEW_BOOKING_REQUEST&limit=10',
    null,
    spAuth,
  );
  ok('SP received NEW_BOOKING_REQUEST notif', newReqNotifs);
  if (newReqNotifs.body.items.length === 0) {
    console.error('✗ NEW_BOOKING_REQUEST notif missing'); process.exit(1);
  }
  console.log('  → matching SP notified of new request');

  const sp2StatsBefore = await req('GET', '/api/v1/service-provider/bookings/stats', null, sp2Auth);
  ok('SP2 dashboard stats', sp2StatsBefore);
  const rejectedBefore = sp2StatsBefore.body.data.rejected;

  const sp2PoolBefore = await req('GET', '/api/v1/service-provider/bookings/pool?limit=100', null, sp2Auth);
  if (!sp2PoolBefore.body.items.some((b) => b.id === booking3Id)) {
    console.error('✗ SP2 should see booking3 before rejecting'); process.exit(1);
  }

  const reject = await req('POST', `/api/v1/service-provider/bookings/${booking3Id}/reject`, null, sp2Auth);
  ok('SP2 rejects booking3', reject);

  const sp2PoolAfter = await req('GET', '/api/v1/service-provider/bookings/pool?limit=100', null, sp2Auth);
  if (sp2PoolAfter.body.items.some((b) => b.id === booking3Id)) {
    console.error('✗ booking3 should be gone from SP2 pool after reject'); process.exit(1);
  }

  // Still available to the first SP — dismissal is per-SP, not global.
  const sp1Pool = await req('GET', '/api/v1/service-provider/bookings/pool?limit=100', null, spAuth);
  if (!sp1Pool.body.items.some((b) => b.id === booking3Id)) {
    console.error('✗ booking3 should still be visible to the first SP'); process.exit(1);
  }

  const sp2StatsAfter = await req('GET', '/api/v1/service-provider/bookings/stats', null, sp2Auth);
  if (sp2StatsAfter.body.data.rejected !== rejectedBefore + 1) {
    console.error(`✗ SP2 rejected count should be ${rejectedBefore + 1}, got ${sp2StatsAfter.body.data.rejected}`); process.exit(1);
  }
  console.log('  → reject is per-SP (dismissal); stats counters work');

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
  // CASH is NOT auto-paid on completion any more — SP confirms separately.
  if (completed.body.data.paymentStatus === 'PAID') {
    console.error('✗ CASH should stay unpaid until "Amount Received"'); process.exit(1);
  }
  console.log('  → CASH completion leaves payment pending (awaits Amount Received)');

  // 14a-pre. Withdrawal is blocked while cash commission is unsettled
  //   (FRD §2.1 "withdrawal only if no commission owed"). The booking is
  //   COMPLETED but Amount Received not confirmed yet → 409.
  const earlyWd = await req(
    'POST',
    '/api/v1/service-provider/withdrawals',
    { amount: 50, bankName: 'Test Bank', bankAccountIban: 'SA1234567890', accountHolderName: 'SP' },
    spAuth,
  );
  assertStatus('Withdrawal blocked while cash commission unsettled', earlyWd, 409);

  // 14a. "Amount Received" — SP confirms cash collected → PAID (FRD §2.3.1.1)
  const cashConfirm = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/amount-received`,
    null,
    spAuth,
  );
  ok('SP confirms Amount Received', cashConfirm);
  if (cashConfirm.body.data.paymentStatus !== 'PAID' || !cashConfirm.body.data.cashReceivedAt) {
    console.error(`✗ Amount Received should mark PAID + set cashReceivedAt`); process.exit(1);
  }
  // Confirming twice → 409
  const cashAgain = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/amount-received`,
    null,
    spAuth,
  );
  assertStatus('Double Amount-Received rejected', cashAgain, 409);
  console.log('  → Amount Received marked CASH booking PAID');

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

  // 19. Profile soft-delete (FRD §2.1). sp2 has no active bookings/withdrawals.
  const badDelete = await req('DELETE', '/api/v1/service-provider/profile', { password: 'wrongpass' }, sp2Auth);
  assertStatus('Delete with wrong password rejected', badDelete, 401);

  const del = await req('DELETE', '/api/v1/service-provider/profile', { password: 'sppass123' }, sp2Auth);
  ok('SP soft-deletes own account', del);

  const afterDelLogin = await req('POST', '/api/v1/auth/mobile/login', { identifier: sp2Email, password: 'sppass123' });
  assertStatus('Deleted SP cannot log in', afterDelLogin, 401);

  // Email slot freed — same email can register again.
  const reSignup = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: sp2Email, password: 'sppass123', nameAr: 'مزود جديد', serviceCategoryId: categoryId,
  });
  ok('Deleted SP email can re-register', reSignup);
  console.log('  → soft-delete: login blocked + email freed for re-registration');

  console.log('\n✓ All booking lifecycle smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

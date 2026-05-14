/**
 * Notifications end-to-end smoke test.
 *
 * Walks each wired event and checks the right user gets the right
 * notification, with the right type + data payload.
 *
 * Events covered:
 *   1. Customer signup → CUSTOMER_WELCOME (to customer)
 *   2. SP signup       → SERVICE_PROVIDER_WELCOME (to SP)
 *   3. Admin approves KYC → KYC_APPROVED (to SP)
 *   4. SP accepts booking → BOOKING_ACCEPTED (to customer)
 *   5. SP starts          → BOOKING_STARTED  (to customer)
 *   6. SP completes       → BOOKING_COMPLETED (to customer)
 *   7. Customer reviews   → REVIEW_RECEIVED   (to SP)
 *
 * Plus the CRUD endpoints:
 *   - GET /notifications (list mine + filter unread)
 *   - GET /notifications/unread-count
 *   - PATCH /notifications/:id/read
 *   - PATCH /notifications/read-all
 *   - 404 on someone else's notification
 *   - Idempotent mark-read on already-read
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

const fetchNotificationsByType = async (auth, type) => {
  const list = await req(
    'GET',
    `/api/v1/notifications?type=${type}&limit=10`,
    null,
    auth,
  );
  if (list.status !== 200) throw new Error(`Fetch ${type} failed`);
  return list.body.items;
};

const expectNotificationOfType = async (auth, type, label) => {
  const items = await fetchNotificationsByType(auth, type);
  if (items.length === 0) {
    console.error(`✗ ${label}: no notification of type ${type} found`);
    process.exit(1);
  }
  console.log(`✓ ${label} → received ${type}`);
  return items[0];
};

(async () => {
  // 0. Admin login + seed
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const tag = Date.now();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Seed catalog
  const cat = await req('POST', '/api/v1/admin/service-categories', {
    titleAr: `cat-notify-${tag}`, titleEn: `Cat ${tag}`,
  }, adminAuth);
  ok('Seed category', cat, 201);
  const svc = await req('POST', '/api/v1/admin/services', {
    categoryId: cat.body.data.id,
    titleAr: `سرفس-${tag}`, titleEn: `Service ${tag}`,
    subcategories: [{ titleAr: 'مهمة', titleEn: 'Task', cost: 100 }],
  }, adminAuth);
  ok('Seed service', svc, 201);
  const serviceId = svc.body.data.id;
  const subId = svc.body.data.subcategories[0].id;

  // 1. Customer signup → CUSTOMER_WELCOME
  const custEmail = `cust-notify-${tag}@test.com`;
  const custSig = await req('POST', '/api/v1/auth/customer/signup', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل',
  });
  ok('Customer signup', custSig);
  const custVfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل', otp: custSig.body.data.otp,
  });
  ok('Customer verify', custVfy, 201);
  const custAuth = { Authorization: `Bearer ${custVfy.body.data.accessToken}` };

  await expectNotificationOfType(custAuth, 'CUSTOMER_WELCOME', 'Customer signup');

  // Unread count should be 1
  const initialCount = await req('GET', '/api/v1/notifications/unread-count', null, custAuth);
  ok('GET /notifications/unread-count', initialCount);
  if (initialCount.body.data.unread !== 1) {
    console.error(`✗ Expected unread=1, got ${initialCount.body.data.unread}`); process.exit(1);
  }
  console.log(`  → unread = ${initialCount.body.data.unread}`);

  // 2. SP signup → SERVICE_PROVIDER_WELCOME
  const spEmail = `sp-notify-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail, password: 'sppass123', nameAr: 'مزود',
  });
  ok('SP signup', spSig);
  const spVfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail, password: 'sppass123', nameAr: 'مزود', otp: spSig.body.data.otp,
  });
  ok('SP verify', spVfy, 201);
  const spAuth = { Authorization: `Bearer ${spVfy.body.data.accessToken}` };
  const spUserId = spVfy.body.data.user.id;
  await expectNotificationOfType(spAuth, 'SERVICE_PROVIDER_WELCOME', 'SP signup');

  // 3. Admin approves SP KYC → KYC_APPROVED
  const kyc = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${spUserId}/kyc`,
    { decision: 'APPROVED', notes: 'All docs valid' },
    adminAuth,
  );
  ok('Admin approves SP KYC', kyc);
  const kycNotif = await expectNotificationOfType(spAuth, 'KYC_APPROVED', 'KYC approval');
  if (kycNotif.data?.decision !== 'APPROVED') {
    console.error('✗ KYC notification data.decision wrong'); process.exit(1);
  }
  console.log(`  → KYC notification carries data.decision = ${kycNotif.data.decision}`);

  // 4. Customer creates booking + SP accepts → BOOKING_ACCEPTED to customer
  const booking = await req(
    'POST',
    '/api/v1/customer/bookings',
    {
      serviceId,
      subcategoryIds: [subId],
      scheduledDate: tomorrow,
      paymentMethod: 'CASH',
    },
    custAuth,
  );
  ok('Customer creates booking', booking, 201);
  const bookingId = booking.body.data.id;

  const accept = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/accept`,
    null,
    spAuth,
  );
  ok('SP accepts booking', accept);
  const acceptedNotif = await expectNotificationOfType(custAuth, 'BOOKING_ACCEPTED', 'Booking accept');
  if (acceptedNotif.data?.bookingId !== bookingId) {
    console.error('✗ BOOKING_ACCEPTED data.bookingId mismatch'); process.exit(1);
  }

  // 5. SP starts → BOOKING_STARTED to customer
  await req('POST', `/api/v1/service-provider/bookings/${bookingId}/start`, null, spAuth);
  await expectNotificationOfType(custAuth, 'BOOKING_STARTED', 'Booking start');

  // 6. SP completes → BOOKING_COMPLETED to customer
  await req('POST', `/api/v1/service-provider/bookings/${bookingId}/complete`, null, spAuth);
  await expectNotificationOfType(custAuth, 'BOOKING_COMPLETED', 'Booking complete');

  // 7. Customer reviews → REVIEW_RECEIVED to SP
  await req(
    'POST',
    `/api/v1/customer/bookings/${bookingId}/review`,
    { rating: 5, comment: 'ممتاز' },
    custAuth,
  );
  const reviewNotif = await expectNotificationOfType(spAuth, 'REVIEW_RECEIVED', 'Review submission');
  if (reviewNotif.data?.rating !== 5) {
    console.error('✗ REVIEW_RECEIVED data.rating mismatch'); process.exit(1);
  }

  // 8. Customer list — should now have 4 notifications (welcome + 3 booking)
  const custList = await req('GET', '/api/v1/notifications?limit=100', null, custAuth);
  ok('Customer notifications list', custList);
  if (custList.body.items.length !== 4) {
    console.error(`✗ Expected 4 customer notifications, got ${custList.body.items.length}`);
    process.exit(1);
  }
  console.log(`  → Customer has ${custList.body.items.length} notifications`);

  // 9. Filter unread=true (should match the count endpoint)
  const unreadList = await req('GET', '/api/v1/notifications?unread=true&limit=100', null, custAuth);
  ok('Filter notifications by unread=true', unreadList);
  if (!unreadList.body.items.every((n) => !n.isRead)) {
    console.error('✗ unread filter returned read rows'); process.exit(1);
  }

  // 10. Mark one notification as read
  const firstId = custList.body.items[0].id;
  const readOne = await req('PATCH', `/api/v1/notifications/${firstId}/read`, null, custAuth);
  ok('Mark one as read', readOne);
  if (!readOne.body.data.isRead) {
    console.error('✗ Notification not marked read'); process.exit(1);
  }

  // 11. Idempotent: marking the same one again should still succeed
  const readAgain = await req('PATCH', `/api/v1/notifications/${firstId}/read`, null, custAuth);
  ok('Mark same notification read again (idempotent)', readAgain);

  // 12. Cross-user: SP can't read someone else's notification
  const xRead = await req('PATCH', `/api/v1/notifications/${firstId}/read`, null, spAuth);
  assertStatus('SP cannot mark customer\'s notification', xRead, 404);

  // 13. Unread count dropped by 1
  const afterCount = await req('GET', '/api/v1/notifications/unread-count', null, custAuth);
  ok('Unread count after mark-one', afterCount);
  if (afterCount.body.data.unread !== 3) {
    console.error(`✗ Expected unread=3, got ${afterCount.body.data.unread}`);
    process.exit(1);
  }
  console.log(`  → unread now = ${afterCount.body.data.unread}`);

  // 14. Mark-all-read
  const markAll = await req('PATCH', '/api/v1/notifications/read-all', null, custAuth);
  ok('Mark all read', markAll);
  if (markAll.body.data.markedRead !== 3) {
    console.error(`✗ Expected markedRead=3, got ${markAll.body.data.markedRead}`);
    process.exit(1);
  }

  const zeroCount = await req('GET', '/api/v1/notifications/unread-count', null, custAuth);
  if (zeroCount.body.data.unread !== 0) {
    console.error(`✗ After mark-all-read, unread should be 0, got ${zeroCount.body.data.unread}`);
    process.exit(1);
  }
  console.log('  → unread now = 0');

  // 15. AuthZ: unauthenticated request → 401
  const noAuth = await req('GET', '/api/v1/notifications');
  assertStatus('Unauthenticated request blocked', noAuth, 401);

  console.log('\n✓ All notifications smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

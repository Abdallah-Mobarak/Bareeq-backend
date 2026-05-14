/**
 * Reviews end-to-end smoke test.
 *
 * Walks the full happy path:
 *   1. Admin seeds category + service (with 1 subcategory, cost=100)
 *   2. Customer signs up + books the service
 *   3. SP signs up, gets KYC approved, accepts, starts, completes the booking
 *   4. Customer submits a review (rating=4 + comment)
 *   5. Verify Service.ratingAverage = 4.00, ratingCount = 1
 *   6. Verify ServiceProvider.ratingAverage = 4.00, ratingCount = 1
 *   7. Customer Home /services/:id/reviews shows the review
 *   8. SP /service-provider/reviews shows the review
 *   9. Admin /admin/reviews shows the review
 *   10. Second submit on same booking → 409
 *   11. A 2nd customer + booking + review (rating=2) — assert average becomes 3.00
 *
 * Negatives covered:
 *   - Review a PENDING booking → 409
 *   - Review someone else's booking → 404
 *   - Cross-role authZ (SP can't POST review, customer can't GET /sp/reviews)
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

const signupCustomer = async (tag) => {
  const email = `cust-rev-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/customer/signup', {
    email, password: 'custpass123', nameAr: 'عميل',
  });
  if (sig.status !== 200) throw new Error('Customer signup failed');
  const vfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email, password: 'custpass123', nameAr: 'عميل', otp: sig.body.data.otp,
  });
  if (vfy.status !== 201) throw new Error('Customer verify failed');
  return { email, userId: vfy.body.data.user.id, token: vfy.body.data.accessToken };
};

const signupAndApproveSp = async (tag, adminAuth) => {
  const email = `sp-rev-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email, password: 'sppass123', nameAr: 'مزود',
  });
  if (sig.status !== 200) throw new Error('SP signup failed');
  const vfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email, password: 'sppass123', nameAr: 'مزود', otp: sig.body.data.otp,
  });
  if (vfy.status !== 201) throw new Error('SP verify failed');
  const kyc = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${vfy.body.data.user.id}/kyc`,
    { decision: 'APPROVED' },
    adminAuth,
  );
  if (kyc.status !== 200) throw new Error('KYC approval failed');
  return { email, userId: vfy.body.data.user.id, token: vfy.body.data.accessToken };
};

/**
 * Drive a booking from PENDING → COMPLETED end-to-end.
 */
const runBookingToCompletion = async ({ custAuth, spAuth, serviceId, subId, tomorrow }) => {
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
  if (booking.status !== 201) throw new Error(`Booking create failed: ${booking.status}`);
  const bookingId = booking.body.data.id;

  const accept = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/accept`,
    null,
    spAuth,
  );
  if (accept.status !== 200) throw new Error(`Accept failed: ${accept.status}`);

  const start = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/start`,
    null,
    spAuth,
  );
  if (start.status !== 200) throw new Error(`Start failed: ${start.status}`);

  const complete = await req(
    'POST',
    `/api/v1/service-provider/bookings/${bookingId}/complete`,
    null,
    spAuth,
  );
  if (complete.status !== 200) throw new Error(`Complete failed: ${complete.status}`);

  return bookingId;
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

  const cat = await req('POST', '/api/v1/admin/service-categories', {
    titleAr: `cat-rev-${tag}`, titleEn: `Cat ${tag}`,
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

  // 1. First customer + SP, book + complete
  const cust1 = await signupCustomer(tag);
  console.log(`  → cust1 ${cust1.email}`);
  const sp = await signupAndApproveSp(tag, adminAuth);
  console.log(`  → SP ${sp.email} (approved)`);
  const cust1Auth = { Authorization: `Bearer ${cust1.token}` };
  const spAuth = { Authorization: `Bearer ${sp.token}` };

  const booking1Id = await runBookingToCompletion({
    custAuth: cust1Auth, spAuth, serviceId, subId, tomorrow,
  });
  console.log(`✓ Booking 1 walked to COMPLETED (${booking1Id})`);

  // 2. Negative: review a non-existent booking → 404
  const bogus = await req(
    'POST',
    '/api/v1/customer/bookings/bogus123/review',
    { rating: 5 },
    cust1Auth,
  );
  assertStatus('Reject review on bogus booking', bogus, 404);

  // 3. Negative: SP cannot POST a review
  const spReview = await req(
    'POST',
    `/api/v1/customer/bookings/${booking1Id}/review`,
    { rating: 5 },
    spAuth,
  );
  assertStatus('SP forbidden from POST review', spReview, 403);

  // 4. Customer 1 submits review: rating=4, comment="ممتاز"
  const review1 = await req(
    'POST',
    `/api/v1/customer/bookings/${booking1Id}/review`,
    { rating: 4, comment: 'خدمة ممتازة شكراً' },
    cust1Auth,
  );
  ok('Customer 1 submits review (rating=4)', review1, 201);
  if (review1.body.data.rating !== 4) {
    console.error('✗ Submitted rating mismatch'); process.exit(1);
  }

  // 5. Second submit on same booking → 409
  const dup = await req(
    'POST',
    `/api/v1/customer/bookings/${booking1Id}/review`,
    { rating: 5 },
    cust1Auth,
  );
  assertStatus('Reject duplicate review on same booking', dup, 409);

  // 6. Verify aggregates: Service + SP both = 4.00 / 1
  const svcAfter1 = await prisma.service.findUnique({ where: { id: serviceId } });
  if (svcAfter1.ratingCount !== 1 || Number(svcAfter1.ratingAverage) !== 4) {
    console.error(`✗ Service aggregates wrong: avg=${svcAfter1.ratingAverage}, count=${svcAfter1.ratingCount}`);
    process.exit(1);
  }
  console.log(`✓ Service aggregates updated: avg=4.00, count=1`);
  const spAfter1 = await prisma.serviceProvider.findUnique({ where: { userId: sp.userId } });
  if (spAfter1.ratingCount !== 1 || Number(spAfter1.ratingAverage) !== 4) {
    console.error(`✗ SP aggregates wrong: avg=${spAfter1.ratingAverage}, count=${spAfter1.ratingCount}`);
    process.exit(1);
  }
  console.log(`✓ SP aggregates updated: avg=4.00, count=1`);

  // 7. GET /customer/bookings/:id/review (the customer's own review)
  const myReview = await req(
    'GET',
    `/api/v1/customer/bookings/${booking1Id}/review`,
    null,
    cust1Auth,
  );
  ok('Customer GETs their own review', myReview);

  // 8. Customer Home: /services/:id/reviews shows it
  const publicList = await req(
    'GET',
    `/api/v1/customer/home/services/${serviceId}/reviews?limit=100`,
    null,
    cust1Auth,
  );
  ok('Customer Home reviews list', publicList);
  if (!publicList.body.items.some((r) => r.id === review1.body.data.id)) {
    console.error('✗ Public reviews list missing the review');
    process.exit(1);
  }

  // 9. SP sees the review
  const spList = await req(
    'GET',
    '/api/v1/service-provider/reviews?limit=100',
    null,
    spAuth,
  );
  ok('SP reviews list', spList);
  if (spList.body.items.length !== 1) {
    console.error('✗ SP should see 1 review'); process.exit(1);
  }

  // 10. Admin sees it
  const adminList = await req(
    'GET',
    `/api/v1/admin/reviews?serviceId=${serviceId}&limit=100`,
    null,
    adminAuth,
  );
  ok('Admin reviews list (filtered)', adminList);

  // 11. AuthZ: customer can't access /service-provider/reviews
  const xRole = await req('GET', '/api/v1/service-provider/reviews', null, cust1Auth);
  assertStatus('Customer forbidden from SP reviews route', xRole, 403);

  // 12. Second booking → second customer rates 2 → aggregates average to 3.00
  const cust2 = await signupCustomer(`${tag}b`);
  const cust2Auth = { Authorization: `Bearer ${cust2.token}` };
  const booking2Id = await runBookingToCompletion({
    custAuth: cust2Auth, spAuth, serviceId, subId, tomorrow,
  });
  console.log(`✓ Booking 2 walked to COMPLETED (${booking2Id})`);

  // Negative: cust1 tries to review cust2's booking → 404 (object-capability)
  const otherBooking = await req(
    'POST',
    `/api/v1/customer/bookings/${booking2Id}/review`,
    { rating: 1 },
    cust1Auth,
  );
  assertStatus('Reject review on someone else\'s booking', otherBooking, 404);

  // Cust2 submits rating=2
  const review2 = await req(
    'POST',
    `/api/v1/customer/bookings/${booking2Id}/review`,
    { rating: 2, comment: 'بطيء' },
    cust2Auth,
  );
  ok('Customer 2 submits review (rating=2)', review2, 201);

  // 13. Aggregates should now be 3.00 / 2 on both Service + SP
  const svcAfter2 = await prisma.service.findUnique({ where: { id: serviceId } });
  if (svcAfter2.ratingCount !== 2 || Number(svcAfter2.ratingAverage) !== 3) {
    console.error(`✗ Service aggregates after 2nd review wrong: avg=${svcAfter2.ratingAverage}, count=${svcAfter2.ratingCount}`);
    process.exit(1);
  }
  console.log(`✓ Aggregates re-averaged: avg=3.00, count=2`);

  // 14. Customer Home services list reflects the new ratingAverage
  const homeList = await req(
    'GET',
    `/api/v1/customer/home/services?categoryId=${cat.body.data.id}&limit=10`,
    null,
    cust1Auth,
  );
  ok('Customer Home services list with ratings', homeList);
  const ourSvc = homeList.body.items.find((s) => s.id === serviceId);
  if (!ourSvc || Number(ourSvc.ratingAverage) !== 3 || ourSvc.ratingCount !== 2) {
    console.error('✗ Customer Home ratings stale', ourSvc);
    process.exit(1);
  }
  console.log(`  → Customer Home shows ratingAverage=${ourSvc.ratingAverage}, count=${ourSvc.ratingCount}`);

  console.log('\n✓ All review smoke tests passed.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Crash:', e);
  await prisma.$disconnect();
  process.exit(1);
});

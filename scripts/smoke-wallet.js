/**
 * e-Wallet end-to-end smoke test.
 *
 * Scenarios covered:
 *   1. Admin tops up a customer's wallet → balance + TOPUP txn + notify
 *   2. Customer views own wallet + transactions
 *   3. Customer creates a WALLET booking with sufficient balance →
 *      balance debited, BOOKING_DEBIT txn, paymentStatus=PAID
 *   4. Insufficient balance booking attempt → 400 (rolled back)
 *   5. Customer cancels the PENDING WALLET booking → REFUND back to
 *      wallet, paymentStatus=REFUNDED
 *   6. Customer rebooks + SP completes → SP gets BOOKING_CREDIT and
 *      COMMISSION_DEBIT, net deposit visible in SP wallet
 *   7. SP wallet aggregates (totalEarned / totalCommissions / balance)
 *   8. Admin adjustment (DEBIT to SP for dispute resolution)
 *   9. Cross-role authZ (SP can't access /customer/wallet, etc.)
 *  10. Balance arithmetic — every step verified end-to-end
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

const assertEq = (label, actual, expected) => {
  if (String(actual) !== String(expected)) {
    console.error(`✗ ${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`✓ ${label} = ${actual}`);
};

(async () => {
  // ----- Seed -----
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local', password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const tag = Date.now();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const cat = await req('POST', '/api/v1/admin/service-categories', {
    titleAr: `cat-w-${tag}`, titleEn: `Cat ${tag}`,
  }, adminAuth);
  ok('Seed category', cat, 201);
  const svc = await req('POST', '/api/v1/admin/services', {
    categoryId: cat.body.data.id,
    titleAr: `سرفس-${tag}`, titleEn: `Service ${tag}`,
    commissionRate: 10,
    subcategories: [{ titleAr: 'مهمة', titleEn: 'Task', cost: 200 }],
  }, adminAuth);
  ok('Seed service (totalCost=200, 10% commission)', svc, 201);
  const serviceId = svc.body.data.id;
  const subId = svc.body.data.subcategories[0].id;

  // Customer + SP
  const custEmail = `cust-w-${tag}@test.com`;
  const custSig = await req('POST', '/api/v1/auth/customer/signup', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل',
  });
  ok('Customer signup', custSig);
  const custVfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل', otp: custSig.body.data.otp,
  });
  ok('Customer verify', custVfy, 201);
  const custAuth = { Authorization: `Bearer ${custVfy.body.data.accessToken}` };
  const custUserId = custVfy.body.data.user.id;

  const spEmail = `sp-w-${tag}@test.com`;
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

  // Approve SP KYC
  await req('PATCH', `/api/v1/admin/service-providers/${spUserId}/kyc`,
    { decision: 'APPROVED' }, adminAuth);

  // ----- 1. Customer wallet initial = 0 -----
  const wallet0 = await req('GET', '/api/v1/customer/wallet', null, custAuth);
  ok('Customer GET wallet (initial)', wallet0);
  assertEq('  Initial balance', wallet0.body.data.balance, '0.00');

  // ----- 2. Admin top-up 500 SAR -----
  const topup = await req('POST', `/api/v1/admin/wallets/${custUserId}/topup`,
    { amount: 500, note: 'Welcome bonus' }, adminAuth);
  ok('Admin top-up 500', topup, 201);
  assertEq('  New balance after top-up', topup.body.data.newBalance, '500.00');

  // Customer notification
  const topupNotif = await req('GET',
    '/api/v1/notifications?type=TOPUP_RECEIVED&limit=10', null, custAuth);
  ok('Top-up notification arrived', topupNotif);
  if (topupNotif.body.items.length === 0) {
    console.error('✗ TOPUP_RECEIVED notification missing'); process.exit(1);
  }

  // ----- 3. Customer view wallet — sees 500 + ledger -----
  const wallet1 = await req('GET', '/api/v1/customer/wallet', null, custAuth);
  assertEq('  Customer balance reflects top-up', wallet1.body.data.balance, '500.00');
  const txns1 = await req('GET', '/api/v1/customer/wallet/transactions',
    null, custAuth);
  ok('Customer GET /wallet/transactions', txns1);
  assertEq('  Ledger has 1 row', txns1.body.items.length, 1);
  assertEq('  First row type', txns1.body.items[0].type, 'TOPUP');

  // ----- 4. Insufficient balance booking attempt -----
  const bigBooking = await req('POST', '/api/v1/customer/bookings', {
    serviceId, subcategoryIds: [subId],
    scheduledDate: tomorrow, paymentMethod: 'WALLET',
    // (the service costs 200, but customer wallet has 500 — that fits)
    // Force insufficient by reducing balance first.
  }, custAuth);
  ok('Customer 1st WALLET booking (200 SAR, balance was 500)', bigBooking, 201);
  const booking1Id = bigBooking.body.data.id;
  assertEq('  Booking paymentMethod', bigBooking.body.data.paymentMethod, 'WALLET');
  assertEq('  Booking paymentStatus', bigBooking.body.data.paymentStatus, 'PAID');

  // Customer balance now 300
  const wallet2 = await req('GET', '/api/v1/customer/wallet', null, custAuth);
  assertEq('  Balance after booking', wallet2.body.data.balance, '300.00');

  // ----- 5. Try to book again with > balance -----
  const dummySvc = await req('POST', '/api/v1/admin/services', {
    categoryId: cat.body.data.id,
    titleAr: `expensive-${tag}`, titleEn: `Big ${tag}`,
    subcategories: [{ titleAr: 'كبير', titleEn: 'Big', cost: 500 }],
  }, adminAuth);
  ok('Seed expensive service (500 SAR)', dummySvc, 201);
  const failBook = await req('POST', '/api/v1/customer/bookings', {
    serviceId: dummySvc.body.data.id,
    subcategoryIds: [dummySvc.body.data.subcategories[0].id],
    scheduledDate: tomorrow, paymentMethod: 'WALLET',
  }, custAuth);
  assertStatus('Insufficient balance booking rejected', failBook, 400);
  if (!String(failBook.body.error.message).toLowerCase().includes('insufficient')) {
    console.error('✗ Error message should mention insufficient', failBook.body);
    process.exit(1);
  }

  // Verify the failed booking transaction was rolled back — balance still 300
  const wallet3 = await req('GET', '/api/v1/customer/wallet', null, custAuth);
  assertEq('  Balance unchanged after rejected booking', wallet3.body.data.balance, '300.00');

  // ----- 6. Cancel the PENDING WALLET booking → REFUND -----
  const cancelRes = await req('POST',
    `/api/v1/customer/bookings/${booking1Id}/cancel`,
    { reason: 'Changed my mind' }, custAuth);
  ok('Cancel WALLET booking', cancelRes);
  assertEq('  Booking status after cancel', cancelRes.body.data.status, 'CANCELLED');
  assertEq('  Booking paymentStatus after cancel', cancelRes.body.data.paymentStatus, 'REFUNDED');

  const wallet4 = await req('GET', '/api/v1/customer/wallet', null, custAuth);
  assertEq('  Balance restored to original after refund',
    wallet4.body.data.balance, '500.00');

  // Verify ledger now has TOPUP + DEBIT + REFUND
  const txns4 = await req('GET', '/api/v1/customer/wallet/transactions',
    null, custAuth);
  assertEq('  Ledger has 3 rows', txns4.body.items.length, 3);
  const types = txns4.body.items.map((t) => t.type).sort();
  if (JSON.stringify(types) !== JSON.stringify(['BOOKING_DEBIT', 'REFUND', 'TOPUP'])) {
    console.error('✗ Ledger types wrong:', types); process.exit(1);
  }

  // ----- 7. Rebook + walk through to COMPLETED → SP gets paid -----
  const booking2 = await req('POST', '/api/v1/customer/bookings', {
    serviceId, subcategoryIds: [subId],
    scheduledDate: tomorrow, paymentMethod: 'WALLET',
  }, custAuth);
  ok('Customer creates 2nd WALLET booking (200 SAR)', booking2, 201);
  const booking2Id = booking2.body.data.id;

  await req('POST', `/api/v1/service-provider/bookings/${booking2Id}/accept`, null, spAuth);
  await req('POST', `/api/v1/service-provider/bookings/${booking2Id}/start`, null, spAuth);
  const complete = await req('POST',
    `/api/v1/service-provider/bookings/${booking2Id}/complete`, null, spAuth);
  ok('SP completes booking', complete);

  // ----- 8. Verify SP wallet credited gross 200, commission 20, net 180 -----
  const spWallet = await req('GET', '/api/v1/service-provider/wallet', null, spAuth);
  ok('SP GET /wallet', spWallet);
  assertEq('  SP balance (200 gross - 20 commission)', spWallet.body.data.balance, '180.00');
  assertEq('  SP totalEarned', spWallet.body.data.totalEarned, '200.00');
  assertEq('  SP totalCommissions', spWallet.body.data.totalCommissions, '20.00');

  // Verify SP ledger has CREDIT + COMMISSION_DEBIT
  const spTxns = await req('GET',
    '/api/v1/service-provider/wallet/transactions?limit=100', null, spAuth);
  const spTypes = spTxns.body.items.map((t) => t.type);
  if (!spTypes.includes('BOOKING_CREDIT')) {
    console.error('✗ SP ledger missing BOOKING_CREDIT'); process.exit(1);
  }
  if (!spTypes.includes('COMMISSION_DEBIT')) {
    console.error('✗ SP ledger missing COMMISSION_DEBIT'); process.exit(1);
  }
  console.log(`  → SP ledger types: ${spTypes.join(', ')}`);

  // ----- 9. Admin adjustment — DEBIT 30 from SP (dispute) -----
  const adj = await req('POST',
    `/api/v1/admin/wallets/${spUserId}/adjustment`,
    { direction: 'DEBIT', amount: 30, note: 'Dispute resolution - customer overcharged' },
    adminAuth);
  ok('Admin adjustment DEBIT 30 on SP', adj, 201);
  assertEq('  SP balance after adjustment', adj.body.data.newBalance, '150.00');

  // ----- 10. Cross-role authZ -----
  const xRole1 = await req('GET', '/api/v1/customer/wallet', null, spAuth);
  assertStatus('SP forbidden from customer wallet', xRole1, 403);
  const xRole2 = await req('GET', '/api/v1/service-provider/wallet', null, custAuth);
  assertStatus('Customer forbidden from SP wallet', xRole2, 403);
  const xRole3 = await req('POST',
    `/api/v1/admin/wallets/${custUserId}/topup`, { amount: 10 }, custAuth);
  assertStatus('Customer forbidden from admin top-up', xRole3, 403);

  // ----- 11. Direct DB cross-check: ledger sums match denormalised balance -----
  const cust = await prisma.customer.findFirst({ where: { userId: custUserId } });
  const custTxnSum = await prisma.walletTransaction.findMany({
    where: { userId: custUserId },
  });
  const SIGN = {
    TOPUP: +1, REFUND: +1, BOOKING_CREDIT: +1, ADJUSTMENT_CREDIT: +1,
    BOOKING_DEBIT: -1, COMMISSION_DEBIT: -1, WITHDRAWAL: -1, ADJUSTMENT_DEBIT: -1,
  };
  const recomputed = custTxnSum.reduce((acc, t) => acc + SIGN[t.type] * Number(t.amount), 0);
  if (Math.abs(recomputed - Number(cust.walletBalance)) > 0.001) {
    console.error(`✗ Ledger drift: balance=${cust.walletBalance}, recomputed=${recomputed.toFixed(2)}`);
    process.exit(1);
  }
  console.log(`✓ Customer ledger sum (${recomputed.toFixed(2)}) matches denormalised balance (${cust.walletBalance})`);

  const sp = await prisma.serviceProvider.findFirst({ where: { userId: spUserId } });
  const spTxnSum = await prisma.walletTransaction.findMany({
    where: { userId: spUserId },
  });
  const spRecomputed = spTxnSum.reduce((acc, t) => acc + SIGN[t.type] * Number(t.amount), 0);
  if (Math.abs(spRecomputed - Number(sp.walletBalance)) > 0.001) {
    console.error(`✗ SP ledger drift: balance=${sp.walletBalance}, recomputed=${spRecomputed.toFixed(2)}`);
    process.exit(1);
  }
  console.log(`✓ SP ledger sum (${spRecomputed.toFixed(2)}) matches denormalised balance (${sp.walletBalance})`);

  console.log('\n✓ All wallet smoke tests passed.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Crash:', e);
  await prisma.$disconnect();
  process.exit(1);
});

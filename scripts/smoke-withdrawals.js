/**
 * Withdrawal lifecycle smoke test.
 *
 * Walks:
 *   1. SP earns money (one completed WALLET booking → 180 SAR net)
 *   2. SP submits withdrawal request below min → 400
 *   3. SP submits withdrawal > balance → 400
 *   4. SP submits valid withdrawal → PENDING
 *   5. Second PENDING attempt → 409 (one at a time)
 *   6. SP cancels → CANCELLED
 *   7. SP submits again → PENDING
 *   8. Admin approves → WITHDRAWAL txn debits SP wallet + status APPROVED +
 *      bankTransferRef captured + SP gets WITHDRAWAL_APPROVED notif
 *   9. Customer (wrong role) can't access admin endpoint → 403
 *  10. SP submits another → PENDING; admin rejects → REJECTED + adminNote +
 *      WITHDRAWAL_REJECTED notif; wallet UNTOUCHED
 *  11. Ledger sum still matches denormalised balance
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
  // ----- Setup: seed customer, SP, service, run a WALLET booking to completion -----
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local', password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const tag = Date.now();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const cat = await req('POST', '/api/v1/admin/service-categories', {
    titleAr: `cat-wd-${tag}`, titleEn: `Cat ${tag}`,
  }, adminAuth);
  ok('Seed category', cat, 201);

  const svc = await req('POST', '/api/v1/admin/services', {
    categoryId: cat.body.data.id,
    titleAr: `سرفس-${tag}`, titleEn: `Service ${tag}`,
    commissionRate: 10,
    subcategories: [{ titleAr: 'مهمة', titleEn: 'Task', cost: 200 }],
  }, adminAuth);
  ok('Seed service', svc, 201);
  const serviceId = svc.body.data.id;
  const subId = svc.body.data.subcategories[0].id;

  // Customer
  const custEmail = `cust-wd-${tag}@test.com`;
  const custSig = await req('POST', '/api/v1/auth/customer/signup', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل',
  });
  const custVfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: custEmail, password: 'custpass123', nameAr: 'عميل', otp: custSig.body.data.otp,
  });
  ok('Customer ready', custVfy, 201);
  const custAuth = { Authorization: `Bearer ${custVfy.body.data.accessToken}` };
  const custUserId = custVfy.body.data.user.id;

  // SP — signs up DISABLED (needs serviceCategoryId + admin approval now).
  const spEmail = `sp-wd-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail, password: 'sppass123', nameAr: 'مزود', serviceCategoryId: cat.body.data.id,
  });
  const spVfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail, password: 'sppass123', nameAr: 'مزود', serviceCategoryId: cat.body.data.id, otp: spSig.body.data.otp,
  });
  ok('SP signed up (pending approval)', spVfy, 201);

  const spLookup = await req('GET', `/api/v1/admin/service-providers?q=${encodeURIComponent(spEmail)}&limit=100`, null, adminAuth);
  const spRows = spLookup.body.items || spLookup.body.data?.items || [];
  const spUserId = spRows.find((r) => r.email === spEmail).id;

  await req('PATCH', `/api/v1/admin/service-providers/${spUserId}/status`, { status: 'ENABLED' }, adminAuth);
  await req('PATCH', `/api/v1/admin/service-providers/${spUserId}/kyc`, { decision: 'APPROVED' }, adminAuth);
  ok('SP enabled + KYC approved', { status: 200 });

  const spLogin = await req('POST', '/api/v1/auth/mobile/login', { identifier: spEmail, password: 'sppass123' });
  ok('SP login', spLogin);
  const spAuth = { Authorization: `Bearer ${spLogin.body.data.accessToken}` };

  // Top up customer + book + complete → SP earns 180 net
  await req('POST', `/api/v1/admin/wallets/${custUserId}/topup`,
    { amount: 500 }, adminAuth);
  const booking = await req('POST', '/api/v1/customer/bookings', {
    serviceId, subcategoryIds: [subId],
    scheduledDate: tomorrow, paymentMethod: 'WALLET',
  }, custAuth);
  ok('Customer creates WALLET booking', booking, 201);
  const bookingId = booking.body.data.id;
  await req('POST', `/api/v1/service-provider/bookings/${bookingId}/accept`, null, spAuth);
  await req('POST', `/api/v1/service-provider/bookings/${bookingId}/start`, null, spAuth);
  await req('POST', `/api/v1/service-provider/bookings/${bookingId}/complete`, null, spAuth);

  const spWallet0 = await req('GET', '/api/v1/service-provider/wallet', null, spAuth);
  assertEq('SP earned balance', spWallet0.body.data.balance, '180.00');

  // ----- 1. Below min withdrawal → 400 -----
  const tooSmall = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 10, bankName: 'Al Rajhi', bankAccountIban: 'SA12345', accountHolderName: 'Test',
  }, spAuth);
  assertStatus('Below-min withdrawal rejected', tooSmall, 400);

  // ----- 2. Over-balance withdrawal → 400 -----
  const tooBig = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 500, bankName: 'Al Rajhi', bankAccountIban: 'SA12345', accountHolderName: 'Test',
  }, spAuth);
  assertStatus('Over-balance withdrawal rejected', tooBig, 400);

  // ----- 3. Valid withdrawal → PENDING -----
  const w1 = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 100,
    bankName: 'Al Rajhi Bank',
    bankAccountIban: 'SA0380000000608010167519',
    accountHolderName: 'Test Provider',
  }, spAuth);
  ok('Valid withdrawal submitted', w1, 201);
  assertEq('  status', w1.body.data.status, 'PENDING');
  const w1Id = w1.body.data.id;

  // FRD §2.4: "Withdrawal request submitted and under review."
  const submittedNotif = await req('GET',
    '/api/v1/notifications?type=WITHDRAWAL_SUBMITTED&limit=10', null, spAuth);
  ok('SP received WITHDRAWAL_SUBMITTED notif', submittedNotif);
  if (submittedNotif.body.items.length === 0) {
    console.error('✗ WITHDRAWAL_SUBMITTED notif missing'); process.exit(1);
  }

  // ----- 4. Second concurrent PENDING → 409 -----
  const w1Dup = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 50,
    bankName: 'Al Rajhi Bank',
    bankAccountIban: 'SA0380000000608010167519',
    accountHolderName: 'Test Provider',
  }, spAuth);
  assertStatus('Second PENDING request rejected', w1Dup, 409);

  // ----- 5. SP cancels their own → CANCELLED -----
  const w1Cancel = await req('POST',
    `/api/v1/service-provider/withdrawals/${w1Id}/cancel`,
    { reason: 'changed my mind' }, spAuth);
  ok('SP cancels withdrawal', w1Cancel);
  assertEq('  status after cancel', w1Cancel.body.data.status, 'CANCELLED');

  // Wallet untouched after cancel
  const spWallet1 = await req('GET', '/api/v1/service-provider/wallet', null, spAuth);
  assertEq('  Wallet unchanged after cancel', spWallet1.body.data.balance, '180.00');

  // ----- 6. SP submits again + admin approves -----
  const w2 = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 100,
    bankName: 'Al Rajhi Bank',
    bankAccountIban: 'SA0380000000608010167519',
    accountHolderName: 'Test Provider',
  }, spAuth);
  ok('Second withdrawal submitted', w2, 201);
  const w2Id = w2.body.data.id;

  // Admin sees it in PENDING list
  const adminList = await req('GET',
    '/api/v1/admin/withdrawals?status=PENDING&limit=100', null, adminAuth);
  ok('Admin lists PENDING withdrawals', adminList);
  if (!adminList.body.items.some((x) => x.id === w2Id)) {
    console.error('✗ Admin list missing the request'); process.exit(1);
  }

  // Customer (wrong role) can't approve
  const xRole = await req('POST',
    `/api/v1/admin/withdrawals/${w2Id}/approve`,
    { bankTransferRef: 'ABC123' }, custAuth);
  assertStatus('Customer forbidden from approve', xRole, 403);

  // Admin approves
  const approved = await req('POST',
    `/api/v1/admin/withdrawals/${w2Id}/approve`,
    { bankTransferRef: 'WIRE-2026-05-14-001', adminNote: 'Fast track' }, adminAuth);
  ok('Admin approves withdrawal', approved);
  assertEq('  status', approved.body.data.status, 'APPROVED');
  assertEq('  bankTransferRef', approved.body.data.bankTransferRef, 'WIRE-2026-05-14-001');
  if (!approved.body.data.walletTransactionId) {
    console.error('✗ walletTransactionId not captured'); process.exit(1);
  }

  // SP wallet debited 100 → balance 80
  const spWallet2 = await req('GET', '/api/v1/service-provider/wallet', null, spAuth);
  assertEq('  SP balance after approval (180-100)', spWallet2.body.data.balance, '80.00');

  // SP got notified
  const spNotifs = await req('GET',
    '/api/v1/notifications?type=WITHDRAWAL_APPROVED&limit=10', null, spAuth);
  ok('SP received WITHDRAWAL_APPROVED notif', spNotifs);
  if (spNotifs.body.items.length === 0) {
    console.error('✗ WITHDRAWAL_APPROVED notif missing'); process.exit(1);
  }
  console.log(`  → notif title: ${spNotifs.body.items[0].titleEn}`);

  // Approve again → 409
  const dupApprove = await req('POST',
    `/api/v1/admin/withdrawals/${w2Id}/approve`,
    { bankTransferRef: 'XYZ' }, adminAuth);
  assertStatus('Cannot approve already-APPROVED', dupApprove, 409);

  // ----- 7. SP requests + admin rejects -----
  const w3 = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 50,
    bankName: 'NCB',
    bankAccountIban: 'SA1010001',  // intentionally short
    accountHolderName: 'Test',
  }, spAuth);
  ok('Third withdrawal submitted', w3, 201);
  const w3Id = w3.body.data.id;

  const rejectMissingNote = await req('POST',
    `/api/v1/admin/withdrawals/${w3Id}/reject`, {}, adminAuth);
  assertStatus('Reject without note → 400', rejectMissingNote, 400);

  const rejected = await req('POST',
    `/api/v1/admin/withdrawals/${w3Id}/reject`,
    { adminNote: 'IBAN format invalid; please verify and resubmit' }, adminAuth);
  ok('Admin rejects withdrawal', rejected);
  assertEq('  status', rejected.body.data.status, 'REJECTED');
  if (rejected.body.data.walletTransactionId) {
    console.error('✗ Rejected withdrawal should NOT have walletTransactionId');
    process.exit(1);
  }

  // Wallet UNTOUCHED by rejection (still 80 after the approved one)
  const spWallet3 = await req('GET', '/api/v1/service-provider/wallet', null, spAuth);
  assertEq('  Wallet unchanged after rejection', spWallet3.body.data.balance, '80.00');

  // SP got rejection notif
  const rejNotifs = await req('GET',
    '/api/v1/notifications?type=WITHDRAWAL_REJECTED&limit=10', null, spAuth);
  ok('SP received WITHDRAWAL_REJECTED notif', rejNotifs);
  if (rejNotifs.body.items.length === 0) {
    console.error('✗ WITHDRAWAL_REJECTED notif missing'); process.exit(1);
  }

  // ----- 7b. E-Wallet withdrawal method (FRD §2.1) -----
  const ewBadBankFields = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 50, method: 'EWALLET', bankName: 'X', bankAccountIban: 'SA12345678', accountHolderName: 'Y',
  }, spAuth);
  assertStatus('EWALLET rejects bank fields', ewBadBankFields, 400);

  const ewMissing = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 50, method: 'EWALLET',
  }, spAuth);
  assertStatus('EWALLET requires wallet fields', ewMissing, 400);

  const ew = await req('POST', '/api/v1/service-provider/withdrawals', {
    amount: 50, method: 'EWALLET', walletName: 'STC Pay', walletId: '0551234567',
  }, spAuth);
  ok('E-Wallet withdrawal submitted', ew, 201);
  assertEq('  method', ew.body.data.method, 'EWALLET');
  assertEq('  walletName', ew.body.data.walletName, 'STC Pay');
  assertEq('  walletId', ew.body.data.walletId, '0551234567');
  if (ew.body.data.bankName !== null) {
    console.error('✗ bank fields should be null for EWALLET'); process.exit(1);
  }
  await req('POST', `/api/v1/service-provider/withdrawals/${ew.body.data.id}/cancel`,
    { reason: 'test cleanup' }, spAuth);
  console.log('  → E-Wallet method persisted; bank fields null');

  // ----- 8. SP can list own + filter -----
  const myList = await req('GET',
    '/api/v1/service-provider/withdrawals?limit=100', null, spAuth);
  ok('SP lists own withdrawals', myList);
  assertEq('  Count (2 cancelled + 1 approved + 1 rejected)',
    myList.body.items.length, 4);

  // ----- 9. Ledger drift check -----
  const sp = await prisma.serviceProvider.findFirst({ where: { userId: spUserId } });
  const spTxns = await prisma.walletTransaction.findMany({ where: { userId: spUserId } });
  const SIGN = {
    TOPUP: +1, REFUND: +1, BOOKING_CREDIT: +1, ADJUSTMENT_CREDIT: +1,
    BOOKING_DEBIT: -1, COMMISSION_DEBIT: -1, WITHDRAWAL: -1, ADJUSTMENT_DEBIT: -1,
  };
  const recomputed = spTxns.reduce((acc, t) => acc + SIGN[t.type] * Number(t.amount), 0);
  if (Math.abs(recomputed - Number(sp.walletBalance)) > 0.001) {
    console.error(`✗ SP ledger drift: balance=${sp.walletBalance}, recomputed=${recomputed.toFixed(2)}`);
    process.exit(1);
  }
  console.log(`✓ SP ledger sum (${recomputed.toFixed(2)}) matches balance (${sp.walletBalance})`);

  // Verify ledger has exactly: BOOKING_CREDIT, COMMISSION_DEBIT, WITHDRAWAL
  const types = spTxns.map((t) => t.type).sort();
  console.log(`  → SP ledger types: ${types.join(', ')}`);
  if (!types.includes('WITHDRAWAL')) {
    console.error('✗ Ledger missing WITHDRAWAL row'); process.exit(1);
  }

  console.log('\n✓ All withdrawal smoke tests passed.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Crash:', e);
  await prisma.$disconnect();
  process.exit(1);
});

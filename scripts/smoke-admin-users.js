/**
 * Admin user management smoke test — admin views customers + SPs,
 * blocks/unblocks them, approves/rejects SP KYC. Verifies that
 * BLOCKED users actually lose access (refresh token revoked +
 * login rejected) and that APPROVED SPs become isVerified=true.
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

const signupCustomer = async (tag) => {
  const email = `cust-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/customer/signup', {
    email,
    password: 'custpass123',
    nameAr: 'عميل',
  });
  if (sig.status !== 200) throw new Error('Customer signup failed');
  const vfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email,
    password: 'custpass123',
    nameAr: 'عميل',
    otp: sig.body.data.otp,
  });
  if (vfy.status !== 201) throw new Error('Customer verify failed');
  return { email, password: 'custpass123', userId: vfy.body.data.user.id, tokens: vfy.body.data };
};

const signupSp = async (tag) => {
  const email = `sp-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email,
    password: 'sppass123',
    nameAr: 'مزود',
  });
  if (sig.status !== 200) throw new Error('SP signup failed');
  const vfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email,
    password: 'sppass123',
    nameAr: 'مزود',
    otp: sig.body.data.otp,
  });
  if (vfy.status !== 201) throw new Error('SP verify failed');
  return { email, password: 'sppass123', userId: vfy.body.data.user.id, tokens: vfy.body.data };
};

(async () => {
  // 0. Admin login
  const adminLogin = await req('POST', '/api/v1/auth/web/login', {
    identifier: 'admin@bareeq.local',
    password: 'Admin@12345',
  });
  ok('Admin login', adminLogin);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const tag = Date.now();

  // 1. Seed: 1 customer, 1 SP
  const cust = await signupCustomer(tag);
  console.log(`  → seeded customer ${cust.email}`);
  const sp = await signupSp(tag);
  console.log(`  → seeded SP ${sp.email}`);

  // ─────────────────────────────────────────────────────────────────
  // CUSTOMER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────

  // 2. List customers — must include our seed
  const list = await req('GET', '/api/v1/admin/customers?limit=100', null, adminAuth);
  ok('GET /admin/customers', list);
  const found = list.body.items.find((c) => c.id === cust.userId);
  if (!found) {
    console.error('✗ Seeded customer not in admin list');
    process.exit(1);
  }
  console.log(`  → ${list.body.items.length} customers total`);

  // 3. Search by partial email
  const searched = await req(
    'GET',
    `/api/v1/admin/customers?q=${encodeURIComponent(cust.email)}`,
    null,
    adminAuth,
  );
  ok('Search customers', searched);
  if (!searched.body.items.some((c) => c.id === cust.userId)) {
    console.error('✗ Search miss');
    process.exit(1);
  }

  // 4. Get detail
  const detail = await req('GET', `/api/v1/admin/customers/${cust.userId}`, null, adminAuth);
  ok('GET /admin/customers/:id', detail);
  if (detail.body.data.status !== 'ENABLED') {
    console.error('✗ Expected ENABLED'); process.exit(1);
  }

  // 5. Block customer
  const blocked = await req(
    'PATCH',
    `/api/v1/admin/customers/${cust.userId}/status`,
    { status: 'BLOCKED', reason: 'Test block' },
    adminAuth,
  );
  ok('Block customer', blocked);
  if (blocked.body.data.status !== 'BLOCKED') {
    console.error('✗ Expected BLOCKED'); process.exit(1);
  }

  // 6. The blocked customer's refresh token should be revoked
  const refreshAttempt = await req('POST', '/api/v1/auth/refresh', {
    refreshToken: cust.tokens.refreshToken,
  });
  if (refreshAttempt.status !== 401 && refreshAttempt.status !== 403) {
    console.error(`✗ Blocked customer refresh should fail (got ${refreshAttempt.status})`, refreshAttempt.body);
    process.exit(1);
  }
  console.log('✓ Blocked customer refresh token rejected');

  // 7. The blocked customer cannot log in
  const reLogin = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: cust.email,
    password: cust.password,
  });
  if (reLogin.status !== 403) {
    console.error(`✗ Blocked login should be 403, got ${reLogin.status}`);
    process.exit(1);
  }
  console.log('✓ Blocked customer login rejected (403)');

  // 8. Filter by status=BLOCKED
  const blockedList = await req(
    'GET',
    '/api/v1/admin/customers?status=BLOCKED&limit=100',
    null,
    adminAuth,
  );
  ok('Filter customers by BLOCKED', blockedList);
  if (!blockedList.body.items.every((c) => c.status === 'BLOCKED')) {
    console.error('✗ Filter returned non-BLOCKED rows'); process.exit(1);
  }

  // 9. Unblock the customer + re-login works
  const unblocked = await req(
    'PATCH',
    `/api/v1/admin/customers/${cust.userId}/status`,
    { status: 'ENABLED' },
    adminAuth,
  );
  ok('Unblock customer', unblocked);
  const reLogin2 = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: cust.email,
    password: cust.password,
  });
  ok('Customer can log in after unblock', reLogin2);

  // 10. Idempotent status update — set BLOCKED twice
  await req(
    'PATCH',
    `/api/v1/admin/customers/${cust.userId}/status`,
    { status: 'BLOCKED' },
    adminAuth,
  );
  const idemp = await req(
    'PATCH',
    `/api/v1/admin/customers/${cust.userId}/status`,
    { status: 'BLOCKED' },
    adminAuth,
  );
  ok('Idempotent status update', idemp);

  // ─────────────────────────────────────────────────────────────────
  // SP MANAGEMENT + KYC
  // ─────────────────────────────────────────────────────────────────

  // 11. List SPs
  const spList = await req('GET', '/api/v1/admin/service-providers?limit=100', null, adminAuth);
  ok('GET /admin/service-providers', spList);
  const ourSp = spList.body.items.find((s) => s.id === sp.userId);
  if (!ourSp) {
    console.error('✗ Seeded SP missing'); process.exit(1);
  }
  if (ourSp.kycStatus !== 'NOT_SUBMITTED') {
    console.error(`✗ Initial KYC should be NOT_SUBMITTED, got ${ourSp.kycStatus}`); process.exit(1);
  }
  if (ourSp.isVerified !== false) {
    console.error('✗ Initial isVerified should be false'); process.exit(1);
  }

  // 12. Filter by kycStatus
  const notSubmitted = await req(
    'GET',
    '/api/v1/admin/service-providers?kycStatus=NOT_SUBMITTED&limit=100',
    null,
    adminAuth,
  );
  ok('Filter SPs by kycStatus=NOT_SUBMITTED', notSubmitted);
  if (!notSubmitted.body.items.every((s) => s.kycStatus === 'NOT_SUBMITTED')) {
    console.error('✗ Filter returned wrong kycStatus rows'); process.exit(1);
  }

  // 13. Approve KYC
  const approved = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${sp.userId}/kyc`,
    { decision: 'APPROVED', notes: 'All docs valid' },
    adminAuth,
  );
  ok('Approve SP KYC', approved);
  if (approved.body.data.kycStatus !== 'APPROVED') {
    console.error('✗ kycStatus not APPROVED'); process.exit(1);
  }
  if (approved.body.data.isVerified !== true) {
    console.error('✗ isVerified not true after approval'); process.exit(1);
  }
  if (!approved.body.data.verifiedAt) {
    console.error('✗ verifiedAt not set after approval'); process.exit(1);
  }
  console.log(`  → kyc=${approved.body.data.kycStatus}, verified=${approved.body.data.isVerified}, at=${approved.body.data.verifiedAt}`);

  // 14. Filter by isVerified=true
  const verifiedOnly = await req(
    'GET',
    '/api/v1/admin/service-providers?isVerified=true&limit=100',
    null,
    adminAuth,
  );
  ok('Filter SPs by isVerified=true', verifiedOnly);
  if (!verifiedOnly.body.items.some((s) => s.id === sp.userId)) {
    console.error('✗ Approved SP not in verified list'); process.exit(1);
  }

  // 15. Reject KYC after approval (should reset verifiedAt + isVerified)
  const rejected = await req(
    'PATCH',
    `/api/v1/admin/service-providers/${sp.userId}/kyc`,
    { decision: 'REJECTED', notes: 'Docs expired' },
    adminAuth,
  );
  ok('Reject SP KYC', rejected);
  if (rejected.body.data.isVerified !== false) {
    console.error('✗ Rejection did not clear isVerified'); process.exit(1);
  }
  if (rejected.body.data.verifiedAt !== null) {
    console.error('✗ Rejection did not null verifiedAt'); process.exit(1);
  }
  console.log('✓ Rejection cleared verification timestamp');

  // 16. AuthZ: a customer cannot access admin endpoints
  const reLogin3 = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: cust.email,
    password: cust.password,
  });
  // cust was BLOCKED twice — try unblock first
  await req(
    'PATCH',
    `/api/v1/admin/customers/${cust.userId}/status`,
    { status: 'ENABLED' },
    adminAuth,
  );
  const reLogin4 = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: cust.email,
    password: cust.password,
  });
  const custAuth = { Authorization: `Bearer ${reLogin4.body.data.accessToken}` };
  const cantList = await req('GET', '/api/v1/admin/customers', null, custAuth);
  if (cantList.status !== 403) {
    console.error(`✗ Customer hitting admin route should be 403, got ${cantList.status}`);
    process.exit(1);
  }
  console.log('✓ Non-admin forbidden from /admin/customers (403)');
  void reLogin3;

  console.log('\n✓ All admin user-management smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

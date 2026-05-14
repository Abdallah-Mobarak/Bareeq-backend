/**
 * Profile management smoke test — exercises Customer + SP self-service
 * profile flows: view, patch, change-password (with current-pw check,
 * refresh-token revocation, and proper authZ between roles).
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
  const tag = Date.now();

  // ─────────────────────────────────────────────────────────────────
  // CUSTOMER FLOW
  // ─────────────────────────────────────────────────────────────────
  const custEmail = `cust-profile-${tag}@test.com`;
  const sig = await req('POST', '/api/v1/auth/customer/signup', {
    email: custEmail,
    password: 'startpass123',
    nameAr: 'عميل',
    nameEn: 'Customer',
    phone: `+9665010${(tag % 10000).toString().padStart(4, '0')}`,
  });
  ok('Customer signup', sig);
  const vfy = await req('POST', '/api/v1/auth/customer/signup/verify', {
    email: custEmail,
    password: 'startpass123',
    nameAr: 'عميل',
    nameEn: 'Customer',
    phone: `+9665010${(tag % 10000).toString().padStart(4, '0')}`,
    otp: sig.body.data.otp,
  });
  ok('Customer verify', vfy, 201);
  const custAuth = { Authorization: `Bearer ${vfy.body.data.accessToken}` };

  // 1. GET own profile — should include wallet balance "0"
  const view = await req('GET', '/api/v1/customer/profile', null, custAuth);
  ok('GET /customer/profile', view);
  if (view.body.data.role !== 'CUSTOMER') {
    console.error('✗ role mismatch'); process.exit(1);
  }
  if (view.body.data.walletBalance !== '0') {
    console.error('✗ wallet not zero'); process.exit(1);
  }
  console.log(`  → walletBalance = ${view.body.data.walletBalance}`);

  // 2. PATCH name + profile picture
  const patched = await req(
    'PATCH',
    '/api/v1/customer/profile',
    {
      nameEn: 'Updated Customer Name',
      profilePicture: 'https://example.com/avatar.png',
    },
    custAuth,
  );
  ok('PATCH /customer/profile', patched);
  if (patched.body.data.nameEn !== 'Updated Customer Name') {
    console.error('✗ name not updated'); process.exit(1);
  }
  if (patched.body.data.profilePicture !== 'https://example.com/avatar.png') {
    console.error('✗ picture not updated'); process.exit(1);
  }

  // 3. PATCH with empty body → should be rejected
  const emptyPatch = await req('PATCH', '/api/v1/customer/profile', {}, custAuth);
  if (emptyPatch.status !== 400) {
    console.error(`✗ Empty PATCH should be 400, got ${emptyPatch.status}`);
    process.exit(1);
  }
  console.log('✓ Empty PATCH rejected (400)');

  // 4. change-password with WRONG current → 401
  const badPw = await req(
    'POST',
    '/api/v1/customer/profile/change-password',
    { currentPassword: 'wrongpassword999', newPassword: 'newpassXYZ123' },
    custAuth,
  );
  if (badPw.status !== 401) {
    console.error(`✗ Wrong current pw should be 401, got ${badPw.status}`, badPw.body);
    process.exit(1);
  }
  console.log('✓ Wrong current password rejected (401)');

  // 5. change-password with same as current → 400
  const samePw = await req(
    'POST',
    '/api/v1/customer/profile/change-password',
    { currentPassword: 'startpass123', newPassword: 'startpass123' },
    custAuth,
  );
  if (samePw.status !== 400) {
    console.error(`✗ Same pw should be 400, got ${samePw.status}`, samePw.body);
    process.exit(1);
  }
  console.log('✓ Same new password rejected (400)');

  // 6. change-password success
  const changed = await req(
    'POST',
    '/api/v1/customer/profile/change-password',
    { currentPassword: 'startpass123', newPassword: 'newpassXYZ123' },
    custAuth,
  );
  ok('change-password success', changed);

  // 7. old refresh token revoked → refresh should fail
  const refreshAttempt = await req('POST', '/api/v1/auth/refresh', {
    refreshToken: vfy.body.data.refreshToken,
  });
  if (refreshAttempt.status !== 401) {
    console.error(`✗ Old refresh token should be revoked (401), got ${refreshAttempt.status}`);
    process.exit(1);
  }
  console.log('✓ Old refresh token revoked after password change (401)');

  // 8. Login with new password works
  const loginAgain = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: custEmail,
    password: 'newpassXYZ123',
  });
  ok('Login with new password', loginAgain);

  // ─────────────────────────────────────────────────────────────────
  // SERVICE PROVIDER FLOW
  // ─────────────────────────────────────────────────────────────────
  const spEmail = `sp-profile-${tag}@test.com`;
  const spSig = await req('POST', '/api/v1/auth/service-provider/signup', {
    email: spEmail,
    password: 'startsp123',
    nameAr: 'مزود',
    nameEn: 'Provider',
    bio: 'كهربائي',
  });
  ok('SP signup', spSig);
  const spVfy = await req('POST', '/api/v1/auth/service-provider/signup/verify', {
    email: spEmail,
    password: 'startsp123',
    nameAr: 'مزود',
    nameEn: 'Provider',
    bio: 'كهربائي',
    otp: spSig.body.data.otp,
  });
  ok('SP verify', spVfy, 201);
  const spAuth = { Authorization: `Bearer ${spVfy.body.data.accessToken}` };

  // 9. GET SP profile — includes bio, KYC status, ratings, wallet
  const spView = await req('GET', '/api/v1/service-provider/profile', null, spAuth);
  ok('GET /service-provider/profile', spView);
  if (spView.body.data.kycStatus !== 'NOT_SUBMITTED') {
    console.error('✗ kycStatus should be NOT_SUBMITTED'); process.exit(1);
  }
  if (spView.body.data.isVerified !== false) {
    console.error('✗ isVerified should be false'); process.exit(1);
  }
  console.log(`  → kyc=${spView.body.data.kycStatus}, verified=${spView.body.data.isVerified}, rating=${spView.body.data.ratingAverage}`);

  // 10. PATCH SP bio + name
  const spPatch = await req(
    'PATCH',
    '/api/v1/service-provider/profile',
    { bio: 'كهربائي بخبرة 15 سنة', nameEn: 'Master Electrician' },
    spAuth,
  );
  ok('PATCH /service-provider/profile', spPatch);
  if (!spPatch.body.data.bio.includes('15')) {
    console.error('✗ bio not updated'); process.exit(1);
  }

  // 11. AuthZ: Customer cannot access SP profile route
  const wrongRole1 = await req('GET', '/api/v1/service-provider/profile', null, custAuth);
  // Customer's old token is now revoked because of password change.
  // Re-login as customer to test cross-role authZ properly.
  const custReAuth = { Authorization: `Bearer ${loginAgain.body.data.accessToken}` };
  const wrongRole = await req('GET', '/api/v1/service-provider/profile', null, custReAuth);
  if (wrongRole.status !== 403) {
    console.error(`✗ Customer hitting SP route should be 403, got ${wrongRole.status}`, wrongRole.body);
    process.exit(1);
  }
  console.log('✓ Customer forbidden from SP profile route (403)');

  // 12. AuthZ: SP cannot access Customer profile route
  const wrongRole2 = await req('GET', '/api/v1/customer/profile', null, spAuth);
  if (wrongRole2.status !== 403) {
    console.error(`✗ SP hitting Customer route should be 403, got ${wrongRole2.status}`);
    process.exit(1);
  }
  console.log('✓ SP forbidden from Customer profile route (403)');

  // 13. SP change-password
  const spChg = await req(
    'POST',
    '/api/v1/service-provider/profile/change-password',
    { currentPassword: 'startsp123', newPassword: 'newsp456' },
    spAuth,
  );
  ok('SP change-password', spChg);

  // 14. SP login with new password
  const spReLogin = await req('POST', '/api/v1/auth/mobile/login', {
    identifier: spEmail,
    password: 'newsp456',
  });
  ok('SP login with new password', spReLogin);

  console.log('\n✓ All Profile smoke tests passed.');
})().catch((e) => {
  console.error('Crash:', e);
  process.exit(1);
});

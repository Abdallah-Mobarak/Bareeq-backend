/**
 * Smoke test for admin broadcast notifications (FRD §4.14 / §3.6).
 *
 * Uses Node's built-in http (not curl) so Arabic survives the round-trip
 * — the Windows terminal mangles Arabic on the curl path.
 */
const http = require('node:http');

const HOST = 'localhost';
const PORT = 3000;
const PREFIX = '/api/v1';

const ADMIN_EMAIL = 'admin@bareeq.local';
const ADMIN_PASSWORD = 'Admin@12345';

const request = (method, path, { token, body } = {}) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: PREFIX + path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(data && { 'Content-Length': Buffer.byteLength(data) }),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });

const expect = (actual, expected, label) => {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
};

const main = async () => {
  console.log('--- Login admin ---');
  const login = await request('POST', '/auth/web/login', {
    body: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.status, 200, 'login');
  const token = login.body.data.accessToken;

  console.log('\n--- Send broadcast (ROLES=ADMIN) ---');
  const send1 = await request('POST', '/admin/broadcasts', {
    token,
    body: {
      titleAr: 'إعلان تجريبي للأدمن',
      titleEn: 'Test Admin Announcement',
      bodyAr: 'هذه رسالة بث تجريبية للأدمن.',
      bodyEn: 'This is a test broadcast to admins.',
      audience: { kind: 'ROLES', roles: ['ADMIN'] },
    },
  });
  expect(send1.status, 201, 'send broadcast');
  const broadcastId = send1.body.data.broadcast.id;
  console.log('  → broadcastId:', broadcastId);
  console.log('  → titleAr:', send1.body.data.broadcast.titleAr);
  console.log('  → recipientCount:', send1.body.data.broadcast.recipientCount);

  console.log('\n--- List broadcasts ---');
  const list = await request('GET', '/admin/broadcasts?page=1&limit=10', { token });
  expect(list.status, 200, 'list broadcasts');
  console.log('  → total:', list.body.data.pagination.total);
  console.log('  → first titleAr:', list.body.data.items[0]?.titleAr);

  console.log('\n--- Get broadcast detail ---');
  const detail = await request('GET', `/admin/broadcasts/${broadcastId}`, { token });
  expect(detail.status, 200, 'get broadcast');
  console.log('  → titleAr:', detail.body.data.broadcast.titleAr);
  console.log('  → bodyAr:', detail.body.data.broadcast.bodyAr);

  console.log('\n--- Verify a recipient sees it in their inbox ---');
  const inbox = await request('GET', '/notifications?page=1&limit=5&type=SYSTEM_ANNOUNCEMENT', {
    token,
  });
  expect(inbox.status, 200, 'list inbox');
  // notifications.controller spreads result at top-level (legacy shape),
  // not nested under .data like every other endpoint.
  const items = inbox.body.items || inbox.body.data?.items || [];
  const matching = items.find((n) => n.titleAr === 'إعلان تجريبي للأدمن');
  expect(Boolean(matching), true, 'admin inbox contains broadcast');

  console.log('\n--- Send broadcast (USERS) — admin sends to themselves only ---');
  const adminUserId = login.body.data.user.id;
  const send2 = await request('POST', '/admin/broadcasts', {
    token,
    body: {
      titleAr: 'رسالة شخصية',
      bodyAr: 'محتوى الرسالة الشخصية.',
      audience: { kind: 'USERS', userIds: [adminUserId] },
    },
  });
  expect(send2.status, 201, 'send USERS broadcast');
  expect(send2.body.data.broadcast.recipientCount, 1, 'recipientCount for self');

  console.log('\n--- Soft-delete the first broadcast ---');
  const del = await request('DELETE', `/admin/broadcasts/${broadcastId}`, { token });
  expect(del.status, 200, 'delete broadcast');

  const afterDel = await request('GET', `/admin/broadcasts/${broadcastId}`, { token });
  expect(afterDel.status, 404, 'deleted broadcast returns 404');

  console.log('\n--- Validation: zero recipients should 400 ---');
  // Audience = USERS with a non-existent id → resolves to 0 valid users.
  const empty = await request('POST', '/admin/broadcasts', {
    token,
    body: {
      titleAr: 'لن تصل',
      bodyAr: 'لا أحد سيستلمها',
      audience: { kind: 'USERS', userIds: ['nonexistent_user_id_xxx'] },
    },
  });
  expect(empty.status, 400, 'empty audience rejected');

  console.log('\n--- Validation: missing required field ---');
  const bad = await request('POST', '/admin/broadcasts', {
    token,
    body: {
      titleAr: 'لا يوجد محتوى',
      audience: { kind: 'ALL' },
    },
  });
  expect(bad.status, 400, 'missing bodyAr rejected');

  console.log('\n=== Smoke test', process.exitCode ? 'FAILED' : 'PASSED', '===');
};

main().catch((err) => {
  console.error('Crash:', err);
  process.exit(1);
});

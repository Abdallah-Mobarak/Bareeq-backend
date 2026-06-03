/* Smoke test for the Supervisor+Company "finish" work. Run: node scripts/smoke-finish-apps.js
 * Uses Node http (Windows terminal mangles Arabic via curl). Reverts any change it makes. */
const http = require('node:http');

const BASE = { host: 'localhost', port: 3000 };
const req = (method, path, { token, body } = {}) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        ...BASE,
        method,
        path: `/api/v1${path}`,
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          Connection: 'close',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(data && { 'Content-Length': Buffer.byteLength(data) }),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch { /* non-json (e.g. pdf) */ }
          resolve({ status: res.statusCode, json, raw: buf, ctype: res.headers['content-type'] });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

const ok = (cond, label) => console.log(`${cond ? '✅' : '❌'} ${label}`);

(async () => {
  // 1) Admin login
  const login = await req('POST', '/auth/web/login', {
    body: { identifier: 'admin@bareeq.local', password: 'Admin@12345' },
  });
  ok(login.status === 200 && login.json?.data?.accessToken, `admin login (${login.status})`);
  const token = login.json?.data?.accessToken;
  if (!token) return console.log('Cannot continue without token:', login.raw);

  ok(login.json.data.accessTokenExpiresIn === '15m',
    `accessTokenExpiresIn is 15m (got ${login.json.data.accessTokenExpiresIn})`);

  ok('preferredLanguage' in (login.json.data.user || {}),
    `login user includes preferredLanguage (= ${login.json.data.user.preferredLanguage})`);

  // 2) GET /auth/me includes preferredLanguage
  const me = await req('GET', '/auth/me', { token });
  ok(me.status === 200 && 'preferredLanguage' in (me.json?.data?.user || {}),
    `GET /auth/me preferredLanguage (= ${me.json?.data?.user?.preferredLanguage})`);

  // 3) PATCH /auth/me → switch language to EN (Phase 1A+1B)
  const patch = await req('PATCH', '/auth/me', { token, body: { preferredLanguage: 'EN' } });
  ok(patch.status === 200 && patch.json?.data?.user?.preferredLanguage === 'EN',
    `PATCH /auth/me → EN (${patch.status}, got ${patch.json?.data?.user?.preferredLanguage})`);

  // 4) confirm persisted
  const me2 = await req('GET', '/auth/me', { token });
  ok(me2.json?.data?.user?.preferredLanguage === 'EN', 'language persisted as EN');

  // 5) revert to AR (leave admin clean)
  const revert = await req('PATCH', '/auth/me', { token, body: { preferredLanguage: 'AR' } });
  ok(revert.json?.data?.user?.preferredLanguage === 'AR', 'reverted to AR');

  // 6) empty PATCH body → 400 (.min(1))
  const empty = await req('PATCH', '/auth/me', { token, body: {} });
  ok(empty.status === 400, `empty PATCH rejected (${empty.status})`);

  // 7) change-password without auth → 401
  const noauth = await req('POST', '/auth/me/change-password', {
    body: { currentPassword: 'x', newPassword: 'yyyyyy' },
  });
  ok(noauth.status === 401, `change-password needs auth (${noauth.status})`);

  // 8) supervisor stats route is MOUNTED + role-gated (admin → 403, not 404)
  const stats = await req('GET', '/supervisor/stats', { token });
  ok(stats.status === 403, `/supervisor/stats mounted & role-gated (${stats.status})`);

  // 9) supervisor stats export route mounted
  const statsx = await req('GET', '/supervisor/stats/export.xlsx', { token });
  ok(statsx.status === 403, `/supervisor/stats/export.xlsx mounted (${statsx.status})`);

  // 9b) supervisor not-implemented-reasons route mounted + role-gated
  const reasons = await req('GET', '/supervisor/not-implemented-reasons', { token });
  ok(reasons.status === 403, `/supervisor/not-implemented-reasons mounted (${reasons.status})`);

  // 10) company branch PDF export route mounted (admin lacks COMPANY role → 403, not 404)
  const cpdf = await req('GET', '/company/branches/abc/export.pdf', { token });
  ok(cpdf.status === 403, `/company/branches/:id/export.pdf mounted (${cpdf.status})`);

  console.log('\nDone.');
})();

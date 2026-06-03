/**
 * Smoke test for the email/OTP wiring.
 *
 * Hits POST /api/v1/auth/customer/signup with a unique email and
 * prints the server response. The Ethereal preview URL appears in
 * the dev server's stdout, not in this script's output.
 *
 * Why a Node script and not curl: Windows terminals mangle Arabic
 * payloads on the command line; Node sends UTF-8 cleanly.
 */
const http = require('node:http');

const unique = Date.now();
const payload = JSON.stringify({
  email: `smoke+${unique}@example.com`,
  password: 'SmokeTest12345!',
  nameAr: 'محمد الاختبار',
  nameEn: 'Mohamed Test',
});

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/auth/customer/signup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      // eslint-disable-next-line no-console
      console.log(`status: ${res.statusCode}`);
      // eslint-disable-next-line no-console
      console.log(`body:   ${body}`);
      // eslint-disable-next-line no-console
      console.log('\nNow check the dev server console for an Ethereal preview URL.');
    });
  },
);

req.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('request failed:', err.message);
  process.exit(1);
});

req.write(payload);
req.end();

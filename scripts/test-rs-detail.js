/* eslint-disable no-console */
const BASE = 'http://localhost:3000/api/v1';

const main = async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'admin@bareeq.local',
      password: 'Admin@12345',
    }),
  });
  const token = (await login.json()).data.accessToken;

  // Pick a branch we know has both AM coverage and a schedule.
  // Branch B from the smoke-monthly run had a schedule.
  const id = process.argv[2] || 'cmosk82ec0006x4vwc0j4bf4m';

  const r = await fetch(`${BASE}/region-schedulings/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`status: ${r.status}`);
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
};

main().catch((e) => console.error(e));

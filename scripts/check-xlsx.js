/* eslint-disable no-console */
const ExcelJS = require('exceljs');

const BASE = 'http://localhost:3000/api/v1';

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'admin@bareeq.local',
      password: 'Admin@12345',
      clientType: 'web',
    }),
  });
  const t = (await login.json()).data.accessToken;

  for (const p of [
    '/companies/export.xlsx',
    '/supervisors/export.xlsx',
    '/admins/export.xlsx',
  ]) {
    const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${t}` } });
    const buf = Buffer.from(await r.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    console.log(`\n${p} → sheet "${sheet.name}", rows=${sheet.rowCount}`);
    console.log(`  headers: ${sheet.getRow(1).values.slice(1).join(' | ')}`);
    if (sheet.rowCount > 1) {
      console.log(`  row 2:   ${sheet.getRow(2).values.slice(1).map((v) => String(v).slice(0, 25)).join(' | ')}`);
    }
  }
})();

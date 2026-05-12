/* eslint-disable no-console */
/**
 * Verifies that the new `ids` filter on /region-schedulings exports
 * applies to both .xlsx and .pdf endpoints.
 */

const ExcelJS = require('exceljs');

const BASE = 'http://localhost:3000/api/v1';

(async () => {
  // Login admin
  const login = await fetch(`${BASE}/auth/web/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'admin@bareeq.local',
      password: 'Admin@12345',
    }),
  });
  const t = (await login.json()).data.accessToken;

  // List a few existing region-schedulings to grab some ids
  const list = await fetch(`${BASE}/region-schedulings?limit=5`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const items = (await list.json()).data.items;
  if (items.length < 2) {
    console.log('Need at least 2 region-schedulings to test. Found:', items.length);
    return;
  }
  const pickedIds = [items[0].id, items[1].id];
  console.log(`Picked ${pickedIds.length} ids:`, pickedIds);

  // ---- Test 1: comma-separated ids on XLSX ----
  let r = await fetch(
    `${BASE}/region-schedulings/export.xlsx?ids=${pickedIds.join(',')}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  let buf = Buffer.from(await r.arrayBuffer());
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.load(buf);
  const rowCount1 = wb1.worksheets[0].rowCount - 1; // minus header
  console.log(`\n1. XLSX export.xlsx?ids=a,b → ${r.status}, rows: ${rowCount1} (expected ${pickedIds.length})`);

  // ---- Test 2: array form ids[]=a&ids[]=b on XLSX ----
  const arrayQs = pickedIds.map((id) => `ids[]=${id}`).join('&');
  r = await fetch(
    `${BASE}/region-schedulings/export.xlsx?${arrayQs}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  buf = Buffer.from(await r.arrayBuffer());
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const rowCount2 = wb2.worksheets[0].rowCount - 1;
  console.log(`2. XLSX ids[]=a&ids[]=b → ${r.status}, rows: ${rowCount2} (expected ${pickedIds.length})`);

  // ---- Test 3: PDF with ids ----
  r = await fetch(
    `${BASE}/region-schedulings/export.pdf?ids=${pickedIds.join(',')}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  buf = Buffer.from(await r.arrayBuffer());
  const isPdf = buf.slice(0, 5).toString() === '%PDF-';
  console.log(
    `3. PDF export.pdf?ids=a,b → ${r.status}, ${buf.length}B, magic=${isPdf ? '✅' : '❌'}`,
  );

  // ---- Test 4: single id ----
  r = await fetch(
    `${BASE}/region-schedulings/export.xlsx?ids=${pickedIds[0]}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  buf = Buffer.from(await r.arrayBuffer());
  const wb3 = new ExcelJS.Workbook();
  await wb3.xlsx.load(buf);
  const rowCount3 = wb3.worksheets[0].rowCount - 1;
  console.log(`4. XLSX single id → ${r.status}, rows: ${rowCount3} (expected 1)`);

  // ---- Test 5: no ids → exports everything ----
  r = await fetch(`${BASE}/region-schedulings/export.xlsx`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  buf = Buffer.from(await r.arrayBuffer());
  const wb4 = new ExcelJS.Workbook();
  await wb4.xlsx.load(buf);
  const rowCount4 = wb4.worksheets[0].rowCount - 1;
  console.log(`5. XLSX no ids → ${r.status}, rows: ${rowCount4} (everything)`);

  // ---- Test 6: ids combined with city filter ----
  const oneCity = items[0].city;
  r = await fetch(
    `${BASE}/region-schedulings/export.xlsx?ids=${pickedIds.join(',')}&city=${encodeURIComponent(oneCity)}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  buf = Buffer.from(await r.arrayBuffer());
  const wb5 = new ExcelJS.Workbook();
  await wb5.xlsx.load(buf);
  const rowCount5 = wb5.worksheets[0].rowCount - 1;
  console.log(`6. XLSX ids + city=${oneCity} → ${r.status}, rows: ${rowCount5} (filters AND together)`);
})();

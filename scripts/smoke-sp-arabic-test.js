const http = require('node:http');

const post = (path, body) =>
  new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf-8');
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

(async () => {
  const email = `provider-utf8-${Date.now()}@test.com`;
  console.log('Email:', email);

  const r1 = await post('/api/v1/auth/service-provider/signup', {
    email,
    password: 'providerpass123',
    nameAr: 'مزود الخدمة',
    nameEn: 'Service Provider UTF8',
    phone: `+9665${Date.now().toString().slice(-8)}`,
    bio: 'إلكترونيات وكهرباء',
  });
  console.log('Signup status:', r1.status);
  const data1 = JSON.parse(r1.body);
  console.log('Signup OTP:', data1.data.otp);

  const r2 = await post('/api/v1/auth/service-provider/signup/verify', {
    email,
    password: 'providerpass123',
    nameAr: 'مزود الخدمة',
    nameEn: 'Service Provider UTF8',
    phone: `+9665${Date.now().toString().slice(-8)}`,
    bio: 'إلكترونيات وكهرباء',
    otp: data1.data.otp,
  });
  console.log('Verify status:', r2.status);
  const data2 = JSON.parse(r2.body);
  console.log('User nameAr from response:', JSON.stringify(data2.data?.user?.nameAr));

  // Read directly from DB to be sure
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const user = await p.user.findFirst({ where: { email } });
  console.log('DB nameAr bytes:', Buffer.from(user.nameAr, 'utf-8').toString('hex'));
  console.log('DB nameAr text:', user.nameAr);
  await p.$disconnect();
})();

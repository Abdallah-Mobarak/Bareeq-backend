# دليل رفع Bareeq Backend على Hostinger VPS

> **الهدف:** رفع الـ backend على Hostinger VPS، تشغيله بشكل دائم، تأمينه، وربطه بالفرونت — ويبقى جاهز للتست والتحديث "أول بأول" عن طريق `git pull`.

> **مهم:** المشروع بيستخدم **PostgreSQL** (مش MySQL)، عشان كده لازم **VPS** مش Shared Hosting.

---

## Stack اللي هنركّبه على السيرفر

| المكوّن | الإصدار / الأداة | الدور |
|---|---|---|
| OS | Ubuntu 24.04 LTS | نظام التشغيل |
| Node.js | 20 LTS | تشغيل التطبيق |
| PostgreSQL | 16 | قاعدة البيانات |
| Nginx | latest | reverse proxy + SSL |
| PM2 | latest | إدارة الـ process |
| Certbot | latest | شهادة SSL مجانية |

---

## Phase 0 — شراء الـ VPS

1. ادخل Hostinger → **VPS Hosting** → اختر **KVM 2** (2 vCPU / 8 GB RAM / 100 GB NVMe).
   - الحد الأدنى المقبول للتست: **KVM 1** (1 vCPU / 4 GB RAM).
2. عند الإعداد اختر نظام التشغيل: **Ubuntu 24.04 LTS** (نظيف، بدون control panel).
3. حدّد **root password** قوي واحفظه.
4. بعد التفعيل، من لوحة Hostinger هتلاقي **IP address** الخاص بالسيرفر. سجّله — هنسمّيه `SERVER_IP` في باقي الدليل.

---

## Phase 1 — أول دخول وتأمين السيرفر

> **WHY:** أول ما السيرفر يبقى online، الـ bots بتبدأ تحاول تدخل عليه. لازم نأمّنه قبل أي حاجة.

### 1.1 الدخول بالـ SSH (من جهازك)
```bash
ssh root@SERVER_IP
```
(على Windows استخدم PowerShell أو Git Bash — الأمر نفسه)

### 1.2 تحديث النظام
```bash
apt update && apt upgrade -y
```

### 1.3 إنشاء مستخدم غير root للنشر
> **WHY:** نشغّل التطبيق بمستخدم محدود الصلاحيات مش root — لو حصل اختراق، الضرر يبقى محدود.
```bash
adduser deploy           # هيطلب password — حطّه واحفظه
usermod -aG sudo deploy
```

### 1.4 تفعيل الـ Firewall
```bash
ufw allow OpenSSH
ufw allow 80          # HTTP
ufw allow 443         # HTTPS
ufw enable            # اكتب y
ufw status
```
> ملاحظة: **مش** هنفتح port 3000 للخارج — التطبيق هيكون خلف Nginx بس.

### 1.5 كمّل بقية الخطوات بمستخدم deploy
```bash
su - deploy
```

---

## Phase 2 — تركيب الـ Runtime Stack

### 2.1 Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # لازم يطلع v20.x
npm -v
```

### 2.2 Git
```bash
sudo apt install -y git
```

### 2.3 PostgreSQL 16
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
psql --version
```

### 2.4 Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```
جرّب: افتح `http://SERVER_IP` في المتصفح — لازم تشوف صفحة "Welcome to nginx".

### 2.5 PM2
```bash
sudo npm install -g pm2
```

---

## Phase 3 — إعداد قاعدة البيانات PostgreSQL

> **WHY:** نعمل database ومستخدم خاص بالتطبيق بـ password قوي. التطبيق هيتصل بيهم عن طريق `DATABASE_URL`.

```bash
sudo -u postgres psql
```
جوه الـ psql نفّذ (غيّر `STRONG_DB_PASSWORD` لباسورد قوي واحفظه):
```sql
CREATE DATABASE bareeq_prod;
CREATE USER bareeq_user WITH ENCRYPTED PASSWORD 'STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE bareeq_prod TO bareeq_user;
ALTER DATABASE bareeq_prod OWNER TO bareeq_user;
\q
```

اختبر الاتصال:
```bash
psql "postgresql://bareeq_user:STRONG_DB_PASSWORD@localhost:5432/bareeq_prod" -c "SELECT 1;"
```

---

## Phase 4 — جلب الكود على السيرفر

> **WHY:** هنستخدم git عشان التحديث بعدين يبقى أمر واحد `git pull`.

> الريبو private؟ اعمل **Personal Access Token** من GitHub (Settings → Developer settings → Tokens) واستخدمه بدل الباسورد، أو اعمل **Deploy Key (SSH)**. لو public تجاهل ده.

```bash
cd ~
git clone https://github.com/Abdallah-Mobarak/Bareeq-backend.git
cd Bareeq-backend
```

---

## Phase 5 — إعداد متغيرات البيئة (.env)

> **WHY:** الـ `.env` مش موجود في git (محمي). لازم نعمله يدوي على السيرفر بقيم production حقيقية.

أنشئ secrets قوية للـ JWT:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # نفّذه مرتين، واحد لكل secret
```

أنشئ الملف:
```bash
nano .env
```
الصق ده وعدّل القيم:
```env
NODE_ENV=production
PORT=3000
API_PREFIX=/api/v1

# الرابط العام للـ backend نفسه — بدون / في الآخر.
# مهم: الكود بيستخدمه لبناء روابط ملفات/مستندات مطلقة. لو غلط، الروابط هتطلع
# http://localhost:3000 وتتكسر عند الفرونت.
# مبدئياً حطّ الـ IP، وبعد ما تعمل SSL في Phase 9 غيّره للرابط https وأعد reload.
PUBLIC_BASE_URL=http://SERVER_IP

# نفس بيانات Phase 3
DATABASE_URL=postgresql://bareeq_user:STRONG_DB_PASSWORD@localhost:5432/bareeq_prod

# الناتج من أمر randomBytes أعلاه (الـ access secret هو الوحيد المطلوب فعلاً)
JWT_ACCESS_SECRET=<paste_random_string>
JWT_ACCESS_EXPIRES_IN=15m
# الـ refresh tokens عبارة عن random tokens متخزنة في الـ DB (مش JWT)، فمفيش
# refresh secret. ده بس مدة صلاحيتها بالأيام:
REFRESH_TOKEN_EXPIRES_IN_DAYS=7

LOG_LEVEL=info

# Email (املأها لو هتبعت إيميلات — سيبها فاضية لو لسه)
EMAIL_FROM=Bareeq <noreply@bareeq.sa>
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# (اختياري) بيانات أول أدمن — لو سيبتها، الـ seed هيستخدم الافتراضي
# admin@bareeq.local / Admin@12345 — غيّرها في production:
SEED_ADMIN_EMAIL=admin@bareeq.local
SEED_ADMIN_PASSWORD=ChangeMe_Strong123
```
احفظ: `Ctrl+O` ثم `Enter` ثم `Ctrl+X`.

> **أمان:** `chmod 600 .env` عشان مستخدمك بس اللي يقدر يقراه.

---

## Phase 6 — التثبيت والـ Migrations والـ Seed

```bash
npm ci                       # تثبيت الـ dependencies بالظبط زي package-lock
npx prisma generate          # توليد Prisma Client
npx prisma migrate deploy    # تطبيق الـ migrations الموجودة (production-safe)
```
> **WHY `migrate deploy` مش `migrate dev`:** الـ `deploy` بيطبّق الـ migrations الجاهزة بس بدون ما يحاول يولّد جديدة أو يمسح بيانات — ده الأمر الصحيح في production.

أنشئ أول admin وبيانات الصلاحيات:
```bash
npm run seed:permissions
npm run seed:admin
npm run seed:marketplace-admin
```

تأكد إن فولدر الرفع موجود:
```bash
mkdir -p uploads
```

---

## Phase 7 — تشغيل التطبيق بـ PM2

```bash
pm2 start src/index.js --name bareeq-api
pm2 status
pm2 logs bareeq-api --lines 50
```
لازم تشوف في الـ logs: `Database connection verified` و `Server running on http://localhost:3000`.

خلّيه يشتغل تلقائياً بعد أي restart للسيرفر:
```bash
pm2 save
pm2 startup
# هيطبع أمر sudo — انسخه ونفّذه زي ما هو
```

اختبار محلي على السيرفر:
```bash
curl http://localhost:3000/health
```
لازم يرجّع `{"status":"ok",...}`.

---

## Phase 8 — Nginx Reverse Proxy

> **WHY:** الناس متوصلش لـ port 3000 مباشرة. Nginx هو اللي بيستقبل على port 80/443 ويوجّه للتطبيق داخلياً — وده مكان إضافة SSL وضغط الترافيك والحماية.

```bash
sudo nano /etc/nginx/sites-available/bareeq
```
الصق (غيّر `SERVER_IP` لو هتستخدم دومين بعدين):
```nginx
server {
    listen 80;
    server_name SERVER_IP;

    client_max_body_size 10m;   # نفس حد رفع الملفات في التطبيق

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
فعّل الموقع:
```bash
sudo ln -s /etc/nginx/sites-available/bareeq /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # اختبار الإعداد
sudo systemctl reload nginx
```
اختبار من جهازك:
```
http://SERVER_IP/health
```

---

## Phase 9 — HTTPS مجاني بدون دومين (sslip.io)

> **WHY:** لو الفرونت شغّال على https، المتصفح **هيمنعه** يكلّم backend على http (mixed content). الحل السريع بدون شراء دومين: نستخدم `sslip.io` اللي بيحوّل أي IP لاسم نطاق تلقائياً، وبعدها Certbot يدّينا شهادة مجانية.

اسم النطاق هيكون: استبدل نقط الـ IP بشرطات. مثال لو الـ IP هو `203.0.113.45` → الاسم يبقى `203-0-113-45.sslip.io`.

1. عدّل `server_name` في إعداد Nginx للاسم ده:
```bash
sudo nano /etc/nginx/sites-available/bareeq
# server_name 203-0-113-45.sslip.io;
sudo nginx -t && sudo systemctl reload nginx
```
2. ركّب Certbot وأصدر الشهادة:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 203-0-113-45.sslip.io
```
Certbot هيعدّل Nginx تلقائياً ويفعّل التجديد. دلوقتي عندك:
```
https://203-0-113-45.sslip.io/health
```

3. **مهم:** دلوقتي عدّل `PUBLIC_BASE_URL` في `.env` للرابط الجديد وأعد التشغيل:
```bash
cd ~/Bareeq-backend
nano .env      # PUBLIC_BASE_URL=https://203-0-113-45.sslip.io
pm2 reload bareeq-api
```

> **بديل أفضل للمدى الطويل:** اشترِ دومين رخيص (مثلاً من Hostinger نفسها) واعمل له `A record` يشاور على الـ `SERVER_IP`، وبعدها كرّر أمر certbot بالدومين الحقيقي. وقتها استخدم subdomain للـ API زي `api.bareeq.com`.

---

## Phase 10 — الاختبار وتسليم الفرونت

### 10.1 اختبارات سريعة
```bash
# health
curl https://203-0-113-45.sslip.io/health

# تسجيل دخول الأدمن (عدّل البيانات حسب seed-admin)
curl -X POST https://203-0-113-45.sslip.io/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bareeq.local","password":"Admin@12345"}'   # أو القيم اللي حطّيتها في SEED_ADMIN_*
```

### 10.2 اللي تبعته لمطوّر الفرونت
- **Base URL:** `https://203-0-113-45.sslip.io/api/v1`
- **رابط الملفات المرفوعة:** `https://203-0-113-45.sslip.io/uploads/...`
- **Health check:** `https://203-0-113-45.sslip.io/health`
- بيانات دخول حساب تجريبي (admin / service provider) من scripts الـ seed.
- ملاحظة: الـ **CORS مفتوح للجميع** حالياً (`cors()`) — كويس للتست. هنقيّده لدومين الفرونت قبل الإطلاق الفعلي.

---

## Phase 11 — التحديث "أول بأول" (Deploy جديد)

كل مرة تعمل تعديل وتعمله push من جهازك:
```bash
# على جهازك المحلي
git push origin main
```
على السيرفر (بمستخدم deploy):
```bash
cd ~/Bareeq-backend
git pull origin main
npm ci                       # لو فيه dependencies جديدة
npx prisma migrate deploy    # لو فيه migrations جديدة
npx prisma generate          # لو الـ schema اتغيّر
pm2 reload bareeq-api        # إعادة تشغيل بدون انقطاع (zero-downtime)
pm2 logs bareeq-api --lines 30
```

> **نصيحة:** ممكن نحط الأوامر دي في سكربت واحد `deploy.sh` على السيرفر عشان التحديث يبقى أمر واحد. اطلبه لما تجهز.

---

## أوامر مرجعية سريعة

| المهمة | الأمر |
|---|---|
| حالة التطبيق | `pm2 status` |
| اللوجات الحية | `pm2 logs bareeq-api` |
| إعادة تشغيل | `pm2 reload bareeq-api` |
| إيقاف | `pm2 stop bareeq-api` |
| حالة Nginx | `sudo systemctl status nginx` |
| اختبار إعداد Nginx | `sudo nginx -t` |
| الدخول لقاعدة البيانات | `psql "postgresql://bareeq_user:PASS@localhost:5432/bareeq_prod"` |
| نسخة احتياطية للـ DB | `pg_dump "postgresql://bareeq_user:PASS@localhost:5432/bareeq_prod" > backup.sql` |

---

## ملاحظات مهمة (اقرأها)

1. **النسخ الاحتياطي:** فعّل backup دوري للـ DB (cron + `pg_dump`) قبل ما تبدأ تدخل بيانات حقيقية.
2. **الملفات المرفوعة:** حالياً بتتخزن محلياً في `uploads/` على السيرفر (بتفضل موجودة مع `git pull`). لو الحجم كبر، ننقل لـ object storage (Cloudinary / S3) — الكود مهيّأ لـ Cloudinary لكن متغيّراته فاضية.
3. **CORS:** قيّده لدومين الفرونت قبل الإطلاق الرسمي.
4. **الأسرار:** متحطش أي secret في git. كله في `.env` على السيرفر بس.
5. **المراقبة:** `pm2 logs` و `/health` أول حاجة تبصّ عليها لو فيه مشكلة.

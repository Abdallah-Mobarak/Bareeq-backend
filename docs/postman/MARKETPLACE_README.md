# Bareeq Marketplace — Postman Collection

كل الـ Sprint 3 endpoints (الـ Services Marketplace subsystem) في collection واحدة.

## الملفات

| الملف | الوصف |
|---|---|
| `bareeq-marketplace.postman_collection.json` | الـ collection — 22 endpoint موزّعين على 5 folders |
| `bareeq-api.postman_environment.json` | الـ environment — متشارك مع باقي الـ collections في المشروع |

## خطوات الاستخدام

### 1. Import في Postman/Apidog
1. افتح Postman أو Apidog
2. **Import** → اختار الـ collection: `bareeq-marketplace.postman_collection.json`
3. **Import** → اختار الـ environment: `bareeq-api.postman_environment.json`
4. في الأعلى شمال اختار "Bareeq Local" من dropdown الـ environment

### 2. شغّل الـ backend محلياً
```powershell
npm start
```
يلازم تشوف:
```
Server running on http://localhost:3000 (env: development)
API available at http://localhost:3000/api/v1
```

### 3. شغّل الـ requests بترتيب

الـ collection فيها 6 folders. **مهم تمشي بالترتيب** لأن كل folder بياخد قيمة من اللي قبله (الـ scripts بتـ capture الـ IDs والـ tokens تلقائياً):

| Folder | الـ Flow | الـ Auth |
|---|---|---|
| `00 — Admin Login` | Login as admin → capture `adminAccessToken` | Public |
| `01 — Customer Auth` | Signup → verify (auto-login) → reset password | Public |
| `02 — Service Provider Auth` | نفس Customer بس بـ bio | Public |
| `03 — Admin Service Categories` | Create → list → get → update → delete | `adminAccessToken` |
| `04 — Admin Services` | Create with subcategories → list → patch → commission → delete | `adminAccessToken` |
| `05 — Customer Home` | Browse categories → list services → service detail | `customerAccessToken` |

### 4. متغيّرات الـ environment

**جاهزة بقيم افتراضية** (مش محتاج تعدّل):
- `baseUrl` = `http://localhost:3000/api/v1`
- `adminEmail` / `adminPassword` = الـ seeded admin
- `customerEmail` / `customerPassword` = customer جديد للـ testing
- `spEmail` / `spPassword` = SP جديد للـ testing

**اللي بتتعمّر تلقائياً من الـ scripts**:
- `adminAccessToken` — بعد login as admin
- `customerSignupOtp` — بعد signup request (dev only)
- `customerAccessToken` — بعد verify
- `spSignupOtp`, `spAccessToken`, `spId` — نفس الفكرة
- `serviceCategoryId`, `serviceId` — بعد إنشاءهم

## مفاهيم مهمة قبل التيست

### الـ OTP في dev mode
لـ MVP، الـ `mailer.js` mock بيـ log الـ email في الـ console. علشان التيست يكون سلس، الـ signup/reset responses بتـرجع الـ `otp` field في **non-production فقط** (الـ scripts بتـ capture-ها تلقائياً). الـ field ده بيتشال في production لما نحط SMTP/SES.

### الـ Total Cost
الـ Service ما عندهوش حقل cost. الـ "service cost" = **مجموع subcategory costs**. الـ server بيحسبها server-side في:
- `POST /admin/services` (response.data.totalCost)
- `GET /admin/services/:id` (response.data.totalCost)
- `GET /customer/home/services` (each item.totalCost)
- `GET /customer/home/services/:id` (response.data.totalCost — default = all subs selected)

### Cost-Range Filter (Customer Home)
لما تـ disable الـ `minCost` / `maxCost` query params (في الـ Customer Home services request)، الفلتر بيشتغل في-memory بعد الـ fetch — لأن الـ totalCost مش column. للـ MVP catalog size ده فاين، للـ scale نحتاج denormalize.

### Anti-Enumeration على Password Reset
الـ `/password-reset/request` بيرجع **نفس الـ shape** سواء كان الـ email موجود في الـ DB أو لأ. في الـ dev mode، الـ `otp` field بس بيظهر لو الـ email حقيقي — ده اللي مخلّى الـ Postman script يـ capture الـ OTP فقط لما الـ user موجود.

### Replace-All على Subcategories (Admin Services)
لو بتعمل `PATCH /admin/services/:id` وحطّيت `subcategories` array في الـ body، الـ array الجديد **بيستبدل** القديم بالكامل (الـ rows القديمة بتـ soft-delete + الجديدة تتعمل). لو ما حطيتش الـ field، الـ subcategories تفضل زي ما هي.

## Smoke Scripts (بديل / مكمّل للـ Postman)

في 3 Node scripts شغّالة في `scripts/`:
- `smoke-marketplace.js` — 10 scenarios لـ admin catalog
- `smoke-customer-home.js` — 16 scenarios لـ customer browse
- `smoke-sp-arabic-test.js` — اختبار UTF-8 roundtrip للـ Arabic

شغّلهم بـ:
```powershell
npm start                                # في terminal منفصل
node scripts/smoke-marketplace.js
node scripts/smoke-customer-home.js
```

الـ scripts دي بـ Node http module، فالـ Arabic بيمشي صح (الـ Windows shell مع curl بيحول الـ Arabic لـ `?` ساعات).

## FRD References

| Folder | FRD Section |
|---|---|
| Customer Auth | §1.1 Customer Profile Management |
| SP Auth | §2.1 Service Provider Profile |
| Admin Service Categories | §3.4 (inferred from §1.2.3) |
| Admin Services | §3.4.1 (services + subcategories + §3.4.1.5 commission) |
| Customer Home | §1.2 (browse + §1.2.4 filters + §1.2.5 search) |

---

> **ملاحظة للـ Sprint 4**: الـ collection دي بتغطّي catalog/auth بس. الـ Booking + Wallet + Reviews هي scope Sprint 4 وهنضيف لها collection منفصلة وقتها.

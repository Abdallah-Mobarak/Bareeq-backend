# Bareeq — Supervisor Mobile App API

> Field-visit Management system · Supervisor (مشرف) mobile surface.
> Everything a Flutter client needs to wire the supervisor app end-to-end.
> Generated from the live backend code — request/response shapes are literal.

---

## BASE URL

```
http://localhost:3000/api/v1
```

- All endpoints below are relative to this base, **except** uploaded photo URLs.
- Photo `url` fields come back as a path like `/uploads/visits/<id>/<file>.jpg`.
  Prepend the host (no `/api/v1`) to display them:
  `http://localhost:3000/uploads/visits/<id>/<file>.jpg`
- The public documentation link (sent to the branch manager) lives under
  `http://localhost:3000/api/v1/public/document/<token>`.
- Replace host/port with the real server when deployed. The API prefix
  (`/api/v1`) is fixed.

---

## AUTH

- Scheme: **Bearer JWT** in the `Authorization` header.
  ```
  Authorization: Bearer <accessToken>
  ```
- The supervisor logs in via `POST /auth/mobile/login` (NOT `/auth/web/login` —
  the server rejects supervisors on the web surface and vice-versa).
- `accessToken` lifetime: **15 minutes**. `refreshToken` lifetime: **7 days**.
- When the access token expires you get `401` with message `"Access token expired"`.
  Call `POST /auth/refresh` with the stored `refreshToken` to get a new pair.
  **Refresh tokens rotate**: every refresh returns a NEW `refreshToken` and the
  old one is immediately revoked — always overwrite the stored value.
- **Auth required** on every endpoint here EXCEPT:
  - `POST /auth/mobile/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /public/document/:token` and its `/submit` + `/pdf` (these are for the
    branch manager, not the supervisor — opened in a normal browser, no token).

---

## COMMON ERROR FORMAT

Every error (validation, 401, 403, 404, 409, 500) has this exact shape:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable message"
  }
}
```

Validation errors (`400`) add a `details` array (one entry per bad field):

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [
      { "field": "latitude", "message": "\"latitude\" is required" },
      { "field": "longitude", "message": "\"longitude\" must be a number" }
    ]
  }
}
```

- `success` is `false` on every error, `true` on every success.
- HTTP status codes used: `400` validation, `401` unauthenticated/expired token,
  `403` forbidden (blocked account / wrong surface), `404` not found,
  `409` conflict (illegal state transition), `429` too many requests, `500` server.
- A `500` in development may include an extra `error.stack` string. Ignore it in
  the client.

---

## GLOBAL FIELD-TYPE CONVENTIONS  (read this once — applies everywhere)

- **Dates / timestamps** are ISO-8601 UTC strings, e.g. `"2026-06-01T09:30:00.000Z"`.
- **Date-only fields** (`scheduledDate`, `firstVisitDate`, `visitDate`) are still
  full ISO-8601 strings but always at midnight UTC, e.g. `"2026-06-10T00:00:00.000Z"`.
  Take the first 10 chars for the calendar day.
- **`latitude`, `longitude`, `startLatitude`, `startLongitude`, `price`** are
  **STRINGS** (or `null`), e.g. `"24.7136"`, NOT numbers. (Prisma `Decimal`
  serializes as a string.) Parse with `double.tryParse(...)` in Flutter.
- **IDs** are cuid strings, e.g. `"clxr2k8z00001a8b3c4d5e6f7"`.
- The success envelope is `{ "success": true, "data": ... }` for almost
  everything. The two list endpoints that DON'T nest under `data` are flagged
  inline (notifications list).

### Enums you'll see

- `status` (VisitStatus): `REMAINING` | `UNDERWAY` | `IMPLEMENTED` | `NOT_IMPLEMENTED` | `FINAL_CLOSED`
- `documentationStatus`: `DOCUMENTED` | `UNDOCUMENTED`
- `role`: `SUPERVISOR` (this app only)
- user `status` (UserStatus): `ENABLED` | `BLOCKED`
- `visitTypes` / `visitType`: `"V1"` | `"V2"` | `"V3"` | `"V4"`

---
---

# 1) AUTHENTICATION
---

ENDPOINT NAME:        Supervisor login
METHOD + PATH:        POST /auth/mobile/login
AUTH REQUIRED:        no
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:
```json
{
  "identifier": "supervisor@bareeq.sa",
  "password": "P@ssw0rd",
  "deviceInfo": "Pixel 8 / Android 14"
}
```
- `identifier`: email OR phone number (the server detects `@` to decide). required, 3–100 chars.
- `password`: required, 6–100 chars.
- `deviceInfo`: optional string (≤255). If omitted, the server falls back to the
  `User-Agent` header. Used to label the session.

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clxr2k8z00001a8b3c4d5e6f7",
      "email": "supervisor@bareeq.sa",
      "phone": "0512345678",
      "role": "SUPERVISOR",
      "status": "ENABLED",
      "nameAr": "أحمد المشرف",
      "nameEn": "Ahmed Supervisor",
      "permissionRoleId": null,
      "permissionRole": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbHhyMms4ejAwMDAxIiwicm9sZSI6IlNVUEVSVklTT1IiLCJpYXQiOjE3MTcyMzA2MDAsImV4cCI6MTcxNzIzMTUwMH0.4mQx...",
    "refreshToken": "k7Jm9pQ2sV4xY8bN1cZ3eR5tW6uI0oP-aS_dF1gH2j",
    "accessTokenExpiresIn": "15m"
  }
}
```

FIELD NOTES:
- `user.phone`: nullable. `user.nameEn`: nullable. `user.email`: nullable
  (a user may have phone-only). For SUPERVISOR, `permissionRoleId` and
  `permissionRole` are always `null` (supervisors use fixed capabilities).
- `accessTokenExpiresIn` is a duration string (`"15m"`), not seconds.
- Store BOTH tokens securely. Send `accessToken` on every request; keep
  `refreshToken` for renewals.

ERROR RESPONSE:
- Wrong email/password (401):
```json
{ "success": false, "error": { "message": "Invalid credentials" } }
```
- A non-supervisor (e.g. admin) trying the mobile surface (403):
```json
{ "success": false, "error": { "message": "This account can only log in from the dashboard" } }
```
- Blocked account (403):
```json
{ "success": false, "error": { "message": "Account is blocked" } }
```

---

ENDPOINT NAME:        Refresh tokens
METHOD + PATH:        POST /auth/refresh
AUTH REQUIRED:        no (the refresh token itself is the credential)
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:
```json
{ "refreshToken": "k7Jm9pQ2sV4xY8bN1cZ3eR5tW6uI0oP-aS_dF1gH2j" }
```

SUCCESS RESPONSE (200): same shape as login —
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clxr2k8z00001a8b3c4d5e6f7",
      "email": "supervisor@bareeq.sa",
      "phone": "0512345678",
      "role": "SUPERVISOR",
      "status": "ENABLED",
      "nameAr": "أحمد المشرف",
      "nameEn": "Ahmed Supervisor",
      "permissionRoleId": null,
      "permissionRole": null
    },
    "accessToken": "eyJhbGciOiJI...new...",
    "refreshToken": "NEW-rotated-refresh-token-value",
    "accessTokenExpiresIn": "15m"
  }
}
```

FIELD NOTES:
- The returned `refreshToken` is NEW — replace the stored one. The old token is
  now dead; reusing it returns 401.

ERROR RESPONSE (401):
```json
{ "success": false, "error": { "message": "Invalid or expired refresh token" } }
```

---

ENDPOINT NAME:        Logout
METHOD + PATH:        POST /auth/logout
AUTH REQUIRED:        no
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:
```json
{ "refreshToken": "k7Jm9pQ2sV4xY8bN1cZ3eR5tW6uI0oP-aS_dF1gH2j" }
```

SUCCESS RESPONSE (200):
```json
{ "success": true, "data": { "message": "Logged out" } }
```

FIELD NOTES:
- Idempotent — returns 200 even if the token was already revoked/unknown.
- Only the refresh token is revoked; the access token keeps working until its
  15-minute expiry (JWTs are stateless). For a hard logout, also drop the
  access token client-side.

ERROR RESPONSE: only validation (400) if `refreshToken` is missing/malformed.

---

ENDPOINT NAME:        Current user
METHOD + PATH:        GET /auth/me
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:         none

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clxr2k8z00001a8b3c4d5e6f7",
      "email": "supervisor@bareeq.sa",
      "phone": "0512345678",
      "role": "SUPERVISOR",
      "status": "ENABLED",
      "nameAr": "أحمد المشرف",
      "nameEn": "Ahmed Supervisor",
      "permissionRoleId": null,
      "permissionRole": null
    }
  }
}
```

FIELD NOTES:
- Re-fetched from the DB each call, so a freshly-blocked account fails here
  immediately (403 "Account is blocked").

ERROR RESPONSE (401):
```json
{ "success": false, "error": { "message": "Access token expired" } }
```

---
---

# 2) SCHEDULE & BRANCHES
---

ENDPOINT NAME:        My schedule summary (this month)
METHOD + PATH:        GET /supervisor/my-schedule
AUTH REQUIRED:        yes
QUERY PARAMS:
- `year` (int, optional, default = current UTC year)
- `month` (int 1–12, optional, default = current UTC month)
PATH PARAMS:          none
REQUEST BODY:         none

SUCCESS RESPONSE (200) — when a schedule exists for that month:
```json
{
  "success": true,
  "data": {
    "year": 2026,
    "month": 6,
    "scheduleId": "clmsch0001xy2z3a4b5c6d7",
    "branchCount": 12,
    "publishedAt": "2026-05-28T10:00:00.000Z"
  }
}
```

SUCCESS RESPONSE (200) — when NO schedule exists for that month:
```json
{
  "success": true,
  "data": {
    "year": 2026,
    "month": 6,
    "scheduleId": null,
    "branchCount": 0
  }
}
```

FIELD NOTES:
- `scheduleId` is `null` and `branchCount` is `0` when the supervisor has no
  schedule that month. Note that in the "no schedule" case the `publishedAt`
  key is **absent** (not `null`) — guard for missing key.
- `publishedAt`: nullable (null if the admin created but hasn't published the
  schedule yet).

ERROR RESPONSE (401): standard auth errors.

---

ENDPOINT NAME:        My branches list (paginated, filterable)
METHOD + PATH:        GET /supervisor/my-schedule/branches
AUTH REQUIRED:        yes
QUERY PARAMS:
- `page` (int, optional, default 1)
- `limit` (int 1–100, optional, default 50)
- `q` (string, optional) — free search across company/branch/category/branchNumber/city/region/code
- `companyName` (string, optional)
- `branchName` (string, optional)
- `categoryName` (string, optional)
- `branchNumber` (string, optional)
- `city` (string, optional)
- `region` (string, optional)
- `code` (string, optional)
- `visitType` (int 1–4, optional) — branches with at least this many visits
- `numberOfVisits` (int 1–4, optional)
- `dateFrom` (ISO date, optional)
- `dateTo` (ISO date, optional)
- `year` (int, optional, default = current year)
- `month` (int 1–12, optional, default = current month)
- `sort` (string, optional, default `"date"`) — one of `newest` | `oldest` | `date` | `nearest`
- `nearestLat` (number -90..90, optional) — required together with `nearestLng` when `sort=nearest`
- `nearestLng` (number -180..180, optional)
PATH PARAMS:          none
REQUEST BODY:         none

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clsv0001aa11bb22cc33dd",
        "monthlyScheduleId": "clmsch0001xy2z3a4b5c6d7",
        "year": 2026,
        "month": 6,
        "regionScheduling": {
          "id": "clrs0001ff22gg33hh44",
          "companyName": "شركة بريق للخدمات",
          "branchName": "فرع العليا",
          "categoryName": "مطاعم",
          "branchNumber": "B-014",
          "city": "الرياض",
          "region": "منطقة الرياض",
          "address": "طريق الملك فهد، حي العليا",
          "location": "https://maps.google.com/?q=24.7136,46.6753",
          "latitude": "24.7136",
          "longitude": "46.6753",
          "numberOfVisits": 2,
          "code": "RYD-014",
          "visitTypes": ["V1", "V2"]
        },
        "numberOfVisits": 2,
        "firstVisitDate": "2026-06-10T00:00:00.000Z",
        "instances": [
          {
            "id": "clvi0001kk11ll22mm33",
            "visitOrder": 1,
            "scheduledDate": "2026-06-10T00:00:00.000Z",
            "status": "IMPLEMENTED",
            "documentationStatus": "DOCUMENTED"
          },
          {
            "id": "clvi0002nn44oo55pp66",
            "visitOrder": 2,
            "scheduledDate": "2026-06-20T00:00:00.000Z",
            "status": "UNDERWAY",
            "documentationStatus": "UNDOCUMENTED"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 12,
      "totalPages": 1
    }
  }
}
```

FIELD NOTES:
- Each `items[]` row is a **ScheduledVisit** (a branch in the month); use its
  `id` as the `:id` for `GET /supervisor/branches/:id`.
- `regionScheduling` can be `null` in theory but is effectively always present
  for a scheduled branch.
- Nullable inside `regionScheduling`: `categoryName`, `branchNumber`, `address`,
  `location`, `latitude`, `longitude`, `code`.
- `latitude`/`longitude` are STRINGS or null.
- `visitTypes` length always equals `numberOfVisits` (`["V1"]` … up to `["V1","V2","V3","V4"]`).
- `instances[]` is one row per V; `status` and `documentationStatus` are the
  enums above. Drives the per-visit UI ("V1 done, V2 underway").
- `sort=nearest` requires BOTH `nearestLat` and `nearestLng`; otherwise it falls
  back to date sort. Branches with no coordinates sort last.

ERROR RESPONSE (400) — bad filter:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [ { "field": "month", "message": "\"month\" must be less than or equal to 12" } ]
  }
}
```

---

ENDPOINT NAME:        Branch detail (full visit timeline)
METHOD + PATH:        GET /supervisor/branches/:id
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — the ScheduledVisit id (NOT the region id)
REQUEST BODY:         none

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "id": "clsv0001aa11bb22cc33dd",
    "monthlyScheduleId": "clmsch0001xy2z3a4b5c6d7",
    "year": 2026,
    "month": 6,
    "regionScheduling": {
      "id": "clrs0001ff22gg33hh44",
      "companyName": "شركة بريق للخدمات",
      "branchName": "فرع العليا",
      "categoryName": "مطاعم",
      "branchNumber": "B-014",
      "city": "الرياض",
      "region": "منطقة الرياض",
      "address": "طريق الملك فهد، حي العليا",
      "location": "https://maps.google.com/?q=24.7136,46.6753",
      "latitude": "24.7136",
      "longitude": "46.6753",
      "numberOfVisits": 2,
      "code": "RYD-014",
      "visitTypes": ["V1", "V2"],
      "requiredTasks": [
        {
          "id": "clrst001aa11bb22",
          "visitType": 1,
          "titleAr": "فحص نظافة الواجهة",
          "titleEn": "Inspect storefront cleanliness",
          "sortOrder": 0
        },
        {
          "id": "clrst002cc33dd44",
          "visitType": 2,
          "titleAr": "مراجعة المخزون",
          "titleEn": "Review inventory",
          "sortOrder": 0
        }
      ]
    },
    "numberOfVisits": 2,
    "firstVisitDate": "2026-06-10T00:00:00.000Z",
    "instances": [
      {
        "id": "clvi0001kk11ll22mm33",
        "visitOrder": 1,
        "scheduledDate": "2026-06-10T00:00:00.000Z",
        "status": "IMPLEMENTED",
        "documentationStatus": "DOCUMENTED",
        "startedAt": "2026-06-10T08:05:00.000Z",
        "endedAt": "2026-06-10T08:35:00.000Z",
        "durationSeconds": 1800,
        "startLatitude": "24.7137",
        "startLongitude": "46.6751",
        "lockedAt": "2026-06-10T08:35:00.000Z",
        "notImplementedReason": null,
        "branchManagerPhone": "0509876543",
        "jobNumber": "JOB-2026-0612",
        "rating": 5,
        "comments": "كل شيء ممتاز",
        "documentedAt": "2026-06-10T08:40:00.000Z",
        "photos": [
          {
            "id": "clph0001aa11",
            "url": "/uploads/visits/clvi0001kk11ll22mm33/1717230600-0-ab12cd34.jpg",
            "sizeBytes": 248310,
            "mimeType": "image/jpeg",
            "uploadedAt": "2026-06-10T08:20:00.000Z"
          }
        ],
        "taskChecks": [
          {
            "id": "cltc0001aa11",
            "regionSchedulingTaskId": "clrst001aa11bb22",
            "titleAr": "فحص نظافة الواجهة",
            "titleEn": "Inspect storefront cleanliness",
            "done": true
          }
        ]
      },
      {
        "id": "clvi0002nn44oo55pp66",
        "visitOrder": 2,
        "scheduledDate": "2026-06-20T00:00:00.000Z",
        "status": "REMAINING",
        "documentationStatus": "UNDOCUMENTED",
        "startedAt": null,
        "endedAt": null,
        "durationSeconds": null,
        "startLatitude": null,
        "startLongitude": null,
        "lockedAt": null,
        "notImplementedReason": null,
        "branchManagerPhone": null,
        "jobNumber": null,
        "rating": null,
        "comments": null,
        "documentedAt": null,
        "photos": [],
        "taskChecks": []
      }
    ]
  }
}
```

FIELD NOTES:
- Same as the list row PLUS `regionScheduling.requiredTasks[]` (the master task
  list) and a much richer `instances[]`.
- `requiredTasks[].titleEn`: nullable. `visitType` is an int 1–4 (= which V).
- Per-instance nullable fields (all null until the supervisor acts):
  `startedAt`, `endedAt`, `durationSeconds`, `startLatitude`, `startLongitude`,
  `lockedAt`, `notImplementedReason`, `branchManagerPhone`, `jobNumber`,
  `rating`, `comments`, `documentedAt`.
- `notImplementedReason` is `null` OR an object `{ id, titleAr, titleEn }`
  (titleEn nullable) — populated only when status is `NOT_IMPLEMENTED`.
- `rating`: int 1–5 or null. `durationSeconds`: int (seconds) or null.
- `photos[]` empty array when none. `taskChecks[]` empty until the visit is started
  (they're snapshotted from `requiredTasks` at `/start`).
- `taskChecks[].regionSchedulingTaskId`: nullable (null if the source task was
  later deleted).

ERROR RESPONSE (404):
```json
{ "success": false, "error": { "message": "Branch not found in your schedule" } }
```

---
---

# 3) VISIT EXECUTION  (the live field flow)
---

> All visit-instance endpoints return the SAME single-instance object (call it
> the **VisitInstance** shape). It's defined once here; the action endpoints just
> return the updated version of it. The `:id` is a **VisitInstance id** (from
> `instances[].id` in the branch detail), NOT the ScheduledVisit id.

**VisitInstance shape (returned by every endpoint in section 3 except photo delete count):**
```json
{
  "id": "clvi0002nn44oo55pp66",
  "visitOrder": 2,
  "scheduledDate": "2026-06-20T00:00:00.000Z",
  "status": "UNDERWAY",
  "documentationStatus": "UNDOCUMENTED",
  "startedAt": "2026-06-20T09:00:00.000Z",
  "endedAt": null,
  "durationSeconds": null,
  "startLatitude": "24.7140",
  "startLongitude": "46.6760",
  "lockedAt": null,
  "notImplementedReasonId": null,
  "branchManagerPhone": null,
  "jobNumber": null,
  "rating": null,
  "comments": null,
  "documentedAt": null,
  "photos": [],
  "taskChecks": [
    {
      "id": "cltc0050aa11",
      "regionSchedulingTaskId": "clrst002cc33dd44",
      "titleAr": "مراجعة المخزون",
      "titleEn": "Review inventory",
      "done": false
    }
  ]
}
```
> NOTE: here the reason is exposed as a flat `notImplementedReasonId` (string|null),
> NOT the nested `notImplementedReason` object you saw in branch detail. Different
> endpoint, slightly different field — wire both.

---

ENDPOINT NAME:        Get one visit instance
METHOD + PATH:        GET /visit-instances/:id
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:         none
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape> }`
FIELD NOTES:          same nullability as the VisitInstance shape above.
ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Visit instance not found" } }`

---

ENDPOINT NAME:        Start visit  (REMAINING → UNDERWAY)
METHOD + PATH:        POST /visit-instances/:id/start
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:
```json
{ "latitude": 24.7140, "longitude": 46.6760 }
```
- Both required, numbers. (Send numbers; they come back as strings.)

SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape, status now "UNDERWAY"> }`
- `startedAt`, `startLatitude`, `startLongitude` are now populated.
- `taskChecks` is now seeded from the branch's required tasks for THIS V (may be empty if none defined).

FIELD NOTES:
- Visits must run in order: you cannot start V2 while V1 is not in a terminal
  state. Trying gives 400 with `details.blockingInstanceId`.

ERROR RESPONSE:
- Already started/closed (409):
```json
{
  "success": false,
  "error": { "message": "Visit is already UNDERWAY and cannot be changed" }
}
```
- Earlier visit still open (400):
```json
{
  "success": false,
  "error": {
    "message": "Cannot act on V2 while V1 is still REMAINING",
    "details": { "blockingInstanceId": "clvi0001kk11ll22mm33" }
  }
}
```

---

ENDPOINT NAME:        Toggle a checklist task (during UNDERWAY)
METHOD + PATH:        PATCH /visit-instances/:id/tasks/:taskCheckId
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (VisitInstance id), `taskCheckId` (the taskCheck id)
REQUEST BODY:
```json
{ "done": true }
```
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape with the task's done flag updated> }`
FIELD NOTES:
- Only allowed while the visit is `UNDERWAY`. Otherwise 409.
ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Task check not found for this visit" } }`

---

ENDPOINT NAME:        Upload visit photos
METHOD + PATH:        POST /visit-instances/:id/photos
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:         **multipart/form-data**, field name `photos` (repeatable).
                      Image files (jpg/png/webp). Max **4 photos total** per visit
                      (cumulative across calls).
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape with photos[] now populated> }`
```json
{
  "success": true,
  "data": {
    "id": "clvi0002nn44oo55pp66",
    "status": "UNDERWAY",
    "photos": [
      {
        "id": "clph0009zz88",
        "url": "/uploads/visits/clvi0002nn44oo55pp66/1717235000-0-ef56gh78.jpg",
        "sizeBytes": 305112,
        "mimeType": "image/jpeg",
        "uploadedAt": "2026-06-20T09:15:00.000Z"
      }
    ]
  }
}
```
(other VisitInstance fields omitted above for brevity — they're all present)

FIELD NOTES:
- Allowed while `UNDERWAY` or after `IMPLEMENTED` (photos can be edited
  post-completion). Any other status → 409.
- `url` is a relative path — prepend the host (without `/api/v1`) to display.
- `sizeBytes`, `mimeType`: nullable in the model but normally present.

ERROR RESPONSE:
- No file (400): `{ "success": false, "error": { "message": "No photos uploaded (field name: photos)" } }`
- Over the cap (400): `{ "success": false, "error": { "message": "Visit already has 3 photo(s); max 4 per visit" } }`

---

ENDPOINT NAME:        Delete a visit photo
METHOD + PATH:        DELETE /visit-instances/:id/photos/:photoId
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (VisitInstance id), `photoId` (photo id)
REQUEST BODY:         none
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape with that photo removed> }`
FIELD NOTES:          allowed while `UNDERWAY` or `IMPLEMENTED`. Soft-delete.
ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Photo not found for this visit" } }`

---

ENDPOINT NAME:        Complete visit  (UNDERWAY → IMPLEMENTED)
METHOD + PATH:        POST /visit-instances/:id/complete
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:         none (send `{}` or empty body)
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape> }`
- `status` → `"IMPLEMENTED"`, `endedAt` set, `durationSeconds` computed, `lockedAt` set.

FIELD NOTES:
- Requires the visit to be `UNDERWAY` AND, if the visit has any task checks, at
  least one must be `done`.

ERROR RESPONSE:
- No task checked (400): `{ "success": false, "error": { "message": "You must check at least one task before completing the visit" } }`
- Wrong state (409): `{ "success": false, "error": { "message": "Visit must be UNDERWAY to take this action (currently REMAINING)" } }`

---

ENDPOINT NAME:        Mark not implemented  (skip with a reason)
METHOD + PATH:        POST /visit-instances/:id/not-implemented
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:
```json
{ "notImplementedReasonId": "clreason001aa11" }
```
- `notImplementedReasonId`: required. A reason id from the admin-managed reasons
  list. (See note below on where to fetch reasons.)

SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape> }`
- `status` → `"NOT_IMPLEMENTED"`, `documentationStatus` → `"UNDOCUMENTED"`,
  `notImplementedReasonId` set, `lockedAt` set.

FIELD NOTES:
- Works from `REMAINING` (sets it) AND from `NOT_IMPLEMENTED` (updates the reason).
- ⚠️ **KNOWN BACKEND GAP:** the list of selectable reasons (`NotImplementedReason`:
  `{ id, titleAr, titleEn }`) is currently only exposed under `GET /reasons`, which
  is **admin-only** (`requireRole('ADMIN')`). There is **no supervisor-accessible
  endpoint** to fetch this list yet, so the Flutter app can't populate the reason
  picker. The backend needs to add a supervisor/mobile-readable reasons endpoint
  before this screen can ship. Flag to the backend team.

ERROR RESPONSE:
- Unknown reason (400): `{ "success": false, "error": { "message": "Reason not found" } }`
- Wrong state (409): `{ "success": false, "error": { "message": "Cannot mark not-implemented while status is IMPLEMENTED" } }`

---

ENDPOINT NAME:        Final-close branch  (cascades remaining visits)
METHOD + PATH:        POST /visit-instances/:id/final-closed
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:         none (send `{}` or empty body)
SUCCESS RESPONSE (200): `{ "success": true, "data": <VisitInstance shape> }`
- `status` → `"FINAL_CLOSED"`, `lockedAt` set.

FIELD NOTES:
- Only from `REMAINING`. All later V's of the same branch are auto-set to
  `NOT_IMPLEMENTED` + `UNDOCUMENTED` and locked. Refetch the branch detail
  afterward to reflect the cascade.

ERROR RESPONSE (409): `{ "success": false, "error": { "message": "Visit is already IMPLEMENTED and cannot be changed" } }`

---
---

# 4) VISIT DOCUMENTATION  (OTP signature by the branch manager)
---

> Flow: supervisor (after IMPLEMENTED) sends an OTP to the branch manager's
> phone → the system also returns a public link → branch manager opens the link
> (no auth) and submits jobNumber/rating/comments → branch manager reads the OTP
> to the supervisor → supervisor verifies it → visit becomes DOCUMENTED.
> **MVP NOTE:** there is no real SMS yet — the OTP and link are returned directly
> in the send-otp response for testing.

---

ENDPOINT NAME:        Send documentation OTP
METHOD + PATH:        POST /visit-instances/:id/document/send-otp
AUTH REQUIRED:        yes (supervisor)
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:
```json
{ "branchManagerPhone": "0509876543" }
```
- Saudi mobile format: `05xxxxxxxx`, `+9665xxxxxxxx`, or `009665xxxxxxxx`.

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "visitInstanceId": "clvi0002nn44oo55pp66",
    "branchManagerPhone": "0509876543",
    "documentationUrl": "http://localhost:3000/api/v1/public/document/k7Jm9pQ2sV4xY8bN1cZ3eR5tW6uI0oP",
    "otp": "482915",
    "otpExpiresAt": "2026-06-20T09:45:00.000Z",
    "devNote": "OTP and link are returned here ONLY in MVP. Replace dispatchOtp() with a real SMS provider before production."
  }
}
```

FIELD NOTES:
- `otp` (6-digit string) and `devNote` exist ONLY in MVP — they will disappear
  once a real SMS provider is wired. Do NOT build UI that depends on `otp` being
  present in production.
- Only allowed when the visit is `IMPLEMENTED` and not yet `DOCUMENTED`.
- Re-callable: each call regenerates a fresh OTP + link (previous one invalidated).
- OTP TTL: 30 minutes.

ERROR RESPONSE (409): `{ "success": false, "error": { "message": "OTP can only be sent once the visit is IMPLEMENTED (currently UNDERWAY)" } }`

---

ENDPOINT NAME:        Verify documentation OTP
METHOD + PATH:        POST /visit-instances/:id/document/verify-otp
AUTH REQUIRED:        yes (supervisor)
QUERY PARAMS:         none
PATH PARAMS:          `id` (string) — VisitInstance id
REQUEST BODY:
```json
{ "otp": "482915" }
```
- Exactly 6 digits.

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "visitInstanceId": "clvi0002nn44oo55pp66",
    "documentationStatus": "DOCUMENTED",
    "documentedAt": "2026-06-20T09:32:00.000Z"
  }
}
```

FIELD NOTES:
- On success the visit's `documentationStatus` flips to `DOCUMENTED` and the OTP
  is burned (single-use).

ERROR RESPONSE:
- Wrong OTP (400): `{ "success": false, "error": { "message": "Invalid OTP" } }`
- Expired (400): `{ "success": false, "error": { "message": "OTP has expired; send a new one" } }`
- None issued (400): `{ "success": false, "error": { "message": "No OTP has been issued for this visit yet" } }`

---

ENDPOINT NAME:        Public — view documentation page  (branch manager, no auth)
METHOD + PATH:        GET /public/document/:token
AUTH REQUIRED:        no
QUERY PARAMS:         none
PATH PARAMS:          `token` (string, 20–120 chars) — the slug from `documentationUrl`
REQUEST BODY:         none

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "visit": {
      "id": "clvi0002nn44oo55pp66",
      "visitOrder": 2,
      "visitType": "V2",
      "scheduledDate": "2026-06-20T00:00:00.000Z",
      "status": "IMPLEMENTED",
      "documentationStatus": "UNDOCUMENTED",
      "startedAt": "2026-06-20T09:00:00.000Z",
      "endedAt": "2026-06-20T09:28:00.000Z",
      "durationSeconds": 1680,
      "jobNumber": null,
      "rating": null,
      "comments": null,
      "documentedAt": null
    },
    "branch": {
      "branchName": "فرع العليا",
      "categoryName": "مطاعم",
      "branchNumber": "B-014",
      "city": "الرياض",
      "region": "منطقة الرياض",
      "address": "طريق الملك فهد، حي العليا",
      "latitude": "24.7136",
      "longitude": "46.6753",
      "code": "RYD-014"
    },
    "company": { "name": "شركة بريق للخدمات" },
    "supervisor": { "nameAr": "أحمد المشرف", "nameEn": "Ahmed Supervisor", "phone": "0512345678" },
    "photos": [
      { "id": "clph0009zz88", "url": "/uploads/visits/clvi0002nn44oo55pp66/1717235000-0-ef56gh78.jpg" }
    ],
    "taskChecks": [
      { "titleAr": "مراجعة المخزون", "titleEn": "Review inventory", "done": true }
    ]
  }
}
```

FIELD NOTES:
- This is for the branch manager's browser page — the supervisor app usually
  doesn't call it, but documented for completeness.
- Nullable: `visit.jobNumber`, `visit.rating`, `visit.comments`, `visit.documentedAt`,
  `visit.startedAt`, `visit.endedAt`, `visit.durationSeconds`; all `branch.*`
  except branchName/city/region; `supervisor.nameEn`, `supervisor.phone`; task `titleEn`.
- `photos[]` here only has `id` + `url` (lighter than the supervisor view).

ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Documentation link not found or has been revoked" } }`

---

ENDPOINT NAME:        Public — submit documentation form  (branch manager, no auth)
METHOD + PATH:        POST /public/document/:token/submit
AUTH REQUIRED:        no
QUERY PARAMS:         none
PATH PARAMS:          `token` (string)
REQUEST BODY:
```json
{ "jobNumber": "JOB-2026-0612", "rating": 5, "comments": "خدمة ممتازة" }
```
- `rating`: required, int 1–5. `jobNumber`: optional (≤100, nullable). `comments`: optional (≤2000, nullable).

SUCCESS RESPONSE (200): same shape as `GET /public/document/:token` (refreshed,
with the submitted `jobNumber`/`rating`/`comments` now filled in `visit`).

FIELD NOTES:
- Storing the form does NOT flip `documentationStatus` — that only happens after
  the supervisor verifies the OTP.

ERROR RESPONSE (409): `{ "success": false, "error": { "message": "This visit has already been documented" } }`

---

ENDPOINT NAME:        Public — download documentation PDF
METHOD + PATH:        GET /public/document/:token/pdf
AUTH REQUIRED:        no
QUERY PARAMS:         none
PATH PARAMS:          `token` (string)
REQUEST BODY:         none
SUCCESS RESPONSE:     **binary** — `Content-Type: application/pdf`, as an
                      attachment `visit-<token8>.pdf`. NOT JSON.
FIELD NOTES:          handle as a file download/stream, not a JSON body.
ERROR RESPONSE (404): JSON `{ "success": false, "error": { "message": "Documentation link not found or has been revoked" } }`

---
---

# 5) ADDITIONAL TASKS  (ad-hoc tasks a manager assigns to the supervisor)
---

> Same status state-machine as visits, but on a separate `AdditionalTask` table.
> NOTE: visit-execution columns (startedAt/endedAt/duration/GPS/lockedAt/reason)
> are **not persisted yet** (Phase C.3) — they always read as `null` for now even
> after start/complete. Only `status` actually changes.

**AdditionalTask shape:**
```json
{
  "id": "claddt001aa11bb22",
  "manager": { "id": "clmgr001xx11", "nameAr": "خالد المدير", "nameEn": "Khaled Manager" },
  "companyName": "شركة بريق للخدمات",
  "branchName": "فرع النخيل",
  "categoryName": "صيدليات",
  "brandName": "فرع النخيل — صيدليات",
  "address": "شارع التحلية، حي النخيل",
  "location": "https://maps.google.com/?q=24.69,46.68",
  "latitude": "24.6900",
  "longitude": "46.6800",
  "visitDate": "2026-06-15T00:00:00.000Z",
  "price": "350.00",
  "notes": "زيارة عاجلة بطلب من العميل",
  "status": "REMAINING",
  "documentationStatus": "UNDOCUMENTED",
  "startedAt": null,
  "endedAt": null,
  "durationSeconds": null,
  "startLatitude": null,
  "startLongitude": null,
  "lockedAt": null,
  "notImplementedReason": null,
  "createdAt": "2026-06-01T07:00:00.000Z",
  "updatedAt": "2026-06-01T07:00:00.000Z"
}
```

FIELD NOTES (apply to every endpoint in section 5):
- `manager`: nullable object `{ id, nameAr, nameEn }` (nameEn nullable).
- Nullable: `branchName`, `categoryName`, `brandName`, `location`, `latitude`,
  `longitude`, `price`, `notes`, and all the (always-null-for-now) execution fields.
- `brandName` is a convenience = `branchName — categoryName` joined, or null.
- `price`, `latitude`, `longitude` are STRINGS or null.
- `visitDate` is a date (midnight UTC). `createdAt`/`updatedAt` are full timestamps.

---

ENDPOINT NAME:        List my additional tasks
METHOD + PATH:        GET /supervisor/additional-tasks
AUTH REQUIRED:        yes
QUERY PARAMS:
- `page` (int, optional, default 1)
- `limit` (int 1–100, optional, default 20)
- `sort` (string, optional, default `"visitDate"`) — `visitDate` | `newest` | `oldest`
- `companyName` (string, optional)
- `branchName` (string, optional)
- `brandName` (string, optional) — matches branchName OR categoryName
- `address` (string, optional)
- `status` (enum, optional) — `REMAINING|UNDERWAY|IMPLEMENTED|NOT_IMPLEMENTED|FINAL_CLOSED`
- `documentationStatus` (enum, optional) — `DOCUMENTED|UNDOCUMENTED`
- `dateFrom` (ISO date, optional)
- `dateTo` (ISO date, optional)
- `ids` (string list, optional) — e.g. `?ids=a,b` or `?ids[]=a&ids[]=b`
PATH PARAMS:          none
REQUEST BODY:         none

SUCCESS RESPONSE (200):
```json
{
  "success": true,
  "data": {
    "items": [ { "...": "AdditionalTask shape (see above)" } ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

ERROR RESPONSE (400): standard validation shape.

---

ENDPOINT NAME:        Additional task detail
METHOD + PATH:        GET /supervisor/additional-tasks/:id
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:         none
SUCCESS RESPONSE (200): `{ "success": true, "data": <AdditionalTask shape> }`
ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Additional task not found" } }`

---

ENDPOINT NAME:        Export additional tasks (Excel / PDF)
METHOD + PATH:        GET /supervisor/additional-tasks/export.xlsx
                      GET /supervisor/additional-tasks/export.pdf
AUTH REQUIRED:        yes
QUERY PARAMS:         same filters as the list endpoint (no pagination)
PATH PARAMS:          none
REQUEST BODY:         none
SUCCESS RESPONSE:     **binary file** — `.xlsx` (spreadsheet) or `.pdf`, as a
                      download. NOT JSON. Filename like
                      `supervisor-additional-tasks-2026-06-01.xlsx`.
FIELD NOTES:          handle as a file download.
ERROR RESPONSE:       validation (400) as JSON.

---

ENDPOINT NAME:        Start additional task  (REMAINING → UNDERWAY)
METHOD + PATH:        POST /supervisor/additional-tasks/:id/start
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:
```json
{ "latitude": 24.6900, "longitude": 46.6800 }
```
- Both required. (Validated but NOT yet persisted — Phase C.3.)
SUCCESS RESPONSE (200): `{ "success": true, "data": <AdditionalTask shape, status now "UNDERWAY"> }`
ERROR RESPONSE (409): `{ "success": false, "error": { "message": "Task is UNDERWAY, only REMAINING tasks can be started" } }`

---

ENDPOINT NAME:        Complete additional task  (UNDERWAY → IMPLEMENTED)
METHOD + PATH:        POST /supervisor/additional-tasks/:id/complete
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:         none
SUCCESS RESPONSE (200): `{ "success": true, "data": <AdditionalTask shape, status now "IMPLEMENTED"> }`
ERROR RESPONSE (409): `{ "success": false, "error": { "message": "Task is REMAINING, only UNDERWAY tasks can be completed" } }`

---

ENDPOINT NAME:        Final-close additional task  (REMAINING → FINAL_CLOSED)
METHOD + PATH:        POST /supervisor/additional-tasks/:id/final-closed
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:         none
SUCCESS RESPONSE (200): `{ "success": true, "data": <AdditionalTask shape, status now "FINAL_CLOSED"> }`
ERROR RESPONSE (409): `{ "success": false, "error": { "message": "Task is UNDERWAY; FINAL_CLOSED must be set before the visit is started" } }`

---

ENDPOINT NAME:        Mark additional task not implemented
METHOD + PATH:        POST /supervisor/additional-tasks/:id/not-implemented
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:
```json
{ "reasonText": "الفرع مغلق بشكل دائم" }
```
- `reasonText`: required, 2–500 chars. (Free text for now — Phase C.3 switches to
  a reason id. This differs from the VISIT not-implemented endpoint, which uses
  `notImplementedReasonId`.)
SUCCESS RESPONSE (200): `{ "success": true, "data": <AdditionalTask shape, status now "NOT_IMPLEMENTED"> }`
- The reason text is appended into `notes` with a `[Not implemented reason] ` prefix for now.
FIELD NOTES:          works from `REMAINING` (sets it) or `NOT_IMPLEMENTED` (updates the reason).
ERROR RESPONSE (409): `{ "success": false, "error": { "message": "Task is IMPLEMENTED; NOT_IMPLEMENTED must be set before the visit is started" } }`

---
---

# 6) NOTIFICATIONS  (shared — any authenticated user)
---

> ⚠️ The LIST endpoint does NOT nest under `data` — `items`/`pagination` sit at
> the top level next to `success`. The other three DO use `data`. Wire carefully.

---

ENDPOINT NAME:        List notifications
METHOD + PATH:        GET /notifications
AUTH REQUIRED:        yes
QUERY PARAMS:
- `page` (int, optional, default 1)
- `limit` (int 1–100, optional, default 20)
- `unread` (bool, optional) — `true` = only unread, `false` = only read, omit = all
- `type` (string, optional) — filter by NotificationType
PATH PARAMS:          none
REQUEST BODY:         none

SUCCESS RESPONSE (200):  ← note: `items` + `pagination` at TOP LEVEL
```json
{
  "success": true,
  "items": [
    {
      "id": "clntf001aa11",
      "type": "SYSTEM_ANNOUNCEMENT",
      "titleAr": "تحديث جديد",
      "titleEn": "New update",
      "bodyAr": "تم تحديث جدول الزيارات",
      "bodyEn": "Your visit schedule was updated",
      "data": { "scheduleId": "clmsch0001xy2z3a4b5c6d7" },
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-06-01T06:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

FIELD NOTES:
- Nullable: `titleEn`, `bodyAr`, `bodyEn`, `data`, `readAt`.
- `data` is an opaque JSON object (deep-link payload) — keys vary by `type`, may be null.
- `isRead` is a convenience boolean (= `readAt !== null`).
- `type` is a NotificationType enum. Values currently defined:
  `CUSTOMER_WELCOME`, `SERVICE_PROVIDER_WELCOME`, `ACCOUNT_BLOCKED`,
  `ACCOUNT_UNBLOCKED`, `KYC_APPROVED`, `KYC_REJECTED`, `BOOKING_ACCEPTED`,
  `BOOKING_STARTED`, `BOOKING_COMPLETED`, `REVIEW_RECEIVED`, `SYSTEM_ANNOUNCEMENT`,
  `TOPUP_RECEIVED`, `WITHDRAWAL_APPROVED`, `WITHDRAWAL_REJECTED`, `DISPUTE_FILED`,
  `DISPUTE_RESPONDED`. (Treat unknown values gracefully — the catalog grows.)

ERROR RESPONSE (401): standard.

---

ENDPOINT NAME:        Unread count
METHOD + PATH:        GET /notifications/unread-count
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:         none
SUCCESS RESPONSE (200):
```json
{ "success": true, "data": { "unread": 3 } }
```
ERROR RESPONSE (401): standard.

---

ENDPOINT NAME:        Mark one notification read
METHOD + PATH:        PATCH /notifications/:id/read
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          `id` (string)
REQUEST BODY:         none
SUCCESS RESPONSE (200): the updated notification object under `data` —
```json
{
  "success": true,
  "data": {
    "id": "clntf001aa11",
    "type": "SYSTEM_ANNOUNCEMENT",
    "titleAr": "تحديث جديد",
    "titleEn": "New update",
    "bodyAr": "تم تحديث جدول الزيارات",
    "bodyEn": "Your visit schedule was updated",
    "data": { "scheduleId": "clmsch0001xy2z3a4b5c6d7" },
    "isRead": true,
    "readAt": "2026-06-01T07:10:00.000Z",
    "createdAt": "2026-06-01T06:30:00.000Z"
  }
}
```
FIELD NOTES:          idempotent — marking an already-read one returns its current state.
ERROR RESPONSE (404): `{ "success": false, "error": { "message": "Notification not found" } }`

---

ENDPOINT NAME:        Mark all notifications read
METHOD + PATH:        PATCH /notifications/read-all
AUTH REQUIRED:        yes
QUERY PARAMS:         none
PATH PARAMS:          none
REQUEST BODY:         none
SUCCESS RESPONSE (200):
```json
{ "success": true, "data": { "markedRead": 3 } }
```
- `markedRead` = how many were flipped from unread to read this call.
ERROR RESPONSE (401): standard.

---
---

## QUICK REFERENCE — all endpoints

| # | Method | Path | Auth |
|---|--------|------|------|
| 1 | POST | /auth/mobile/login | no |
| 2 | POST | /auth/refresh | no |
| 3 | POST | /auth/logout | no |
| 4 | GET | /auth/me | yes |
| 5 | GET | /supervisor/my-schedule | yes |
| 6 | GET | /supervisor/my-schedule/branches | yes |
| 7 | GET | /supervisor/branches/:id | yes |
| 8 | GET | /visit-instances/:id | yes |
| 9 | POST | /visit-instances/:id/start | yes |
| 10 | PATCH | /visit-instances/:id/tasks/:taskCheckId | yes |
| 11 | POST | /visit-instances/:id/photos | yes |
| 12 | DELETE | /visit-instances/:id/photos/:photoId | yes |
| 13 | POST | /visit-instances/:id/complete | yes |
| 14 | POST | /visit-instances/:id/not-implemented | yes |
| 15 | POST | /visit-instances/:id/final-closed | yes |
| 16 | POST | /visit-instances/:id/document/send-otp | yes |
| 17 | POST | /visit-instances/:id/document/verify-otp | yes |
| 18 | GET | /public/document/:token | no |
| 19 | POST | /public/document/:token/submit | no |
| 20 | GET | /public/document/:token/pdf | no |
| 21 | GET | /supervisor/additional-tasks | yes |
| 22 | GET | /supervisor/additional-tasks/:id | yes |
| 23 | GET | /supervisor/additional-tasks/export.xlsx | yes |
| 24 | GET | /supervisor/additional-tasks/export.pdf | yes |
| 25 | POST | /supervisor/additional-tasks/:id/start | yes |
| 26 | POST | /supervisor/additional-tasks/:id/complete | yes |
| 27 | POST | /supervisor/additional-tasks/:id/final-closed | yes |
| 28 | POST | /supervisor/additional-tasks/:id/not-implemented | yes |
| 29 | GET | /notifications | yes |
| 30 | GET | /notifications/unread-count | yes |
| 31 | PATCH | /notifications/:id/read | yes |
| 32 | PATCH | /notifications/read-all | yes |

---

_Notes for the Flutter dev:_
- The typical happy path screen flow: login → `GET /supervisor/my-schedule` →
  `GET /supervisor/my-schedule/branches` → tap a branch →
  `GET /supervisor/branches/:id` → on a visit: `start` → toggle tasks + upload
  photos → `complete` → `document/send-otp` → `document/verify-otp`.
- Always parse `latitude`/`longitude`/`price` as strings.
- On any `401 "Access token expired"`, transparently call `/auth/refresh` and retry.

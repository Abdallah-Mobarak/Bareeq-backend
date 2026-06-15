# Bareeq Admin Dashboard — API Reference (Marketplace Web)

> Last sprint: the **Admin web dashboard** for the Services Marketplace.
> This document maps every dashboard screen to its backend endpoint(s).

## Conventions

- **Base URL:** `{HOST}/api/v1`
- **Auth:** every endpoint below (except login) requires
  `Authorization: Bearer <accessToken>` and role **ADMIN** *or* **MARKETPLACE_ADMIN**.
  Get the token from `POST /auth/web/login`.
- **Role separation:** `MARKETPLACE_ADMIN` is a dedicated account type that
  can **only** reach the marketplace dashboard modules below. It is blocked
  (403) from every Management-System route (companies, regions, supervisors,
  settings, …). A root `ADMIN` can still access both systems.
  - Test account (seeded): `marketplace-admin@bareeq.local` / `Market@12345`
    (run `npm run seed:marketplace-admin`).
- **Response envelope:**
  - Single item → `{ "success": true, "data": { ... } }`
  - List → `{ "success": true, "items": [ ... ], "pagination": { "page", "limit", "total", "totalPages" } }`
- **Common list query params:** `page` (default 1), `limit` (default 20, max 100),
  `q` (search text), `sort`. Specific sort/filter values are listed per screen.

---

## 0. Login screen

| Action | Method | Path | Body |
|---|---|---|---|
| Admin login | `POST` | `/auth/web/login` | `{ "emailOrPhone": "...", "password": "..." }` |
| Current admin | `GET` | `/auth/me` | — |
| Refresh token | `POST` | `/auth/refresh` | `{ "refreshToken": "..." }` |
| Logout | `POST` | `/auth/logout` | `{ "refreshToken": "..." }` |

> `web/login` is the surface for admin/manager/company/accountant. Supervisor uses `mobile/login`.

---

## 1. User Managements

### Tab: Customers
| Action | Method | Path |
|---|---|---|
| List customers | `GET` | `/admin/customers` |
| Customer details | `GET` | `/admin/customers/:id` |
| Enable / Block | `PATCH` | `/admin/customers/:id/status` |

- **List query:** `q`, `status` = `ENABLED` \| `BLOCKED`, `sort` = `newest` \| `oldest` \| `name`.
- **Status body:** `{ "status": "ENABLED" | "BLOCKED", "reason": "optional" }`
- Admin only toggles status — name/phone/password are edited by the customer themselves.

### Tab: Services Providers
| Action | Method | Path |
|---|---|---|
| List providers | `GET` | `/admin/service-providers` |
| Provider details | `GET` | `/admin/service-providers/:id` |
| Enable / Block | `PATCH` | `/admin/service-providers/:id/status` |
| KYC approve / reject | `PATCH` | `/admin/service-providers/:id/kyc` |

- **List query:** `q`, `status` = `ENABLED`\|`BLOCKED`, `kycStatus` = `NOT_SUBMITTED`\|`PENDING`\|`APPROVED`\|`REJECTED`, `isVerified` (bool), `sort` = `newest`\|`oldest`\|`name`\|`rating`\|`pendingFirst`.
- **Status body:** `{ "status": "ENABLED" | "BLOCKED", "reason": "optional" }`
- **KYC body:** `{ "decision": "APPROVED" | "REJECTED", "notes": "optional" }`

---

## 2. Requests (bookings)

> Both "Pending" and "Approved" tabs use the same list endpoint, filtered by `status`.

| Action | Method | Path |
|---|---|---|
| List requests | `GET` | `/admin/bookings` |
| Service Booking Details | `GET` | `/admin/bookings/:id` |

- **List query:** `status` = `PENDING`\|`APPROVED`\|`IN_PROGRESS`\|`COMPLETED`\|`CANCELLED`\|`REJECTED`,
  `serviceId`, `customerId`, `assignedSpId`,
  `paymentMethod` = `CASH`\|`WALLET`\|`ONLINE`, `paymentStatus` = `PENDING`\|`PAID`\|`REFUNDED`,
  `sort` = `newest`\|`oldest`.
- Detail returns the full booking: service, subcategories, customer info, location, scheduled date, description, total cost.
- **Read-only for admin** — no approve/reject endpoint here (that's the SP's action via the SP app).

---

## Image upload (shared)

Service/category create+update take an image **URL**, not a file. To attach an
uploaded image: upload the file first, then send the returned `url` as
`imageUrl` (service) or `iconUrl` (category).

| Action | Method | Path |
|---|---|---|
| Upload image | `POST` | `/admin/uploads` |

- **Request:** `multipart/form-data`, single file under field **`image`**.
  JPEG / PNG / WebP, max **5 MB**.
- **Response (201):** `{ "success": true, "data": { "url": "/uploads/marketplace/...", "sizeBytes": 1234, "mimeType": "image/png" } }`
- The `url` is publicly served (GET `/uploads/...`). Send it back as `imageUrl` / `iconUrl`.

---

## 3. Service Types

### Tab: Service Listings  →  module `admin/services`
| Action | Method | Path |
|---|---|---|
| List services | `GET` | `/admin/services` |
| Service details | `GET` | `/admin/services/:id` |
| Add service | `POST` | `/admin/services` |
| Edit service | `PATCH` | `/admin/services/:id` |
| Update commission rate | `PATCH` | `/admin/services/:id/commission` |
| Delete service | `DELETE` | `/admin/services/:id` |

- **List query:** `q`, `categoryId`, `isActive` (bool), `sort` = `newest`\|`oldest`\|`sortOrder`\|`name`\|`rating`.
- **Create body:**
  ```json
  {
    "categoryId": "required",
    "titleAr": "required", "titleEn": "optional",
    "descriptionAr": "optional", "descriptionEn": "optional",
    "imageUrl": "optional (URL)",
    "commissionRate": 12.5,
    "isActive": true,
    "sortOrder": 0,
    "subcategories": [
      { "titleAr": "required", "titleEn": "optional", "cost": 249, "sortOrder": 0 }
    ]
  }
  ```
- **Update:** same fields, all optional, ≥1 required. `commissionRate` is **not** here — use the dedicated endpoint.
- **Commission body:** `{ "commissionRate": 12.5 }` (0–100, 2 decimals). Powers the "Commission Rate %" card on the detail screen.
- ⚠️ **`subcategories` on create/update REPLACES the whole list** (soft-deletes old, creates new). Send the full array every time.

### Tab: Categories  →  module `admin/service-categories`
| Action | Method | Path |
|---|---|---|
| List categories | `GET` | `/admin/service-categories` |
| Category details | `GET` | `/admin/service-categories/:id` |
| Add Category | `POST` | `/admin/service-categories` |
| Edit category | `PATCH` | `/admin/service-categories/:id` |
| Delete category | `DELETE` | `/admin/service-categories/:id` |

- **List query:** `q`, `isActive` (bool), `sort` = `newest`\|`oldest`\|`sortOrder`\|`name`.
- **Create body:** `{ "titleAr": "required", "titleEn": "optional", "iconUrl": "optional", "isActive": true, "sortOrder": 0 }`
  - The "Add Category" modal only sends the name → `titleAr`.

> ⚠️ **GAP — "Add Subcategory" modal (Category + name + price):** see Open Questions §A below.

---

## 4. Financial

### Summary cards (Total Payments / Commissions Collected / Net Profit)
| Action | Method | Path |
|---|---|---|
| Financial summary | `GET` | `/admin/financial/summary` |

- **Query (optional):** `from`, `to` (ISO dates) to narrow to bookings completed in that range. Omit both for all-time totals.
- **Response:** `{ "success": true, "data": { "totalPayments": "4099.00", "commissionsCollected": "379.90", "netProfit": "379.90", "currency": "SAR" } }`
- All amounts are strings (2 decimals). Definitions (FRD §3.5.1): summed over **COMPLETED** bookings.
  `totalPayments` = Σ `totalCost`; `commissionsCollected` = Σ `commissionAmount`;
  `netProfit` = commissions − operating costs. **No cost ledger exists yet, so `netProfit == commissionsCollected`** — adjust when costs are modelled.

### Withdrawal Requests
| Action | Method | Path |
|---|---|---|
| List withdrawals | `GET` | `/admin/withdrawals` |
| Withdrawal details | `GET` | `/admin/withdrawals/:id` |
| Approve | `POST` | `/admin/withdrawals/:id/approve` |
| Reject | `POST` | `/admin/withdrawals/:id/reject` |

- **List query:** `status` = `PENDING`\|`APPROVED`\|`REJECTED`\|`CANCELLED`, `spId`, `sort` = `newest`\|`oldest`\|`pendingFirst`.
- **Approve body:** `{ "bankTransferRef": "required", "adminNote": "optional" }`
- **Reject body:** `{ "adminNote": "required reason" }`

### Wallet (per provider, used from provider detail)
| Action | Method | Path |
|---|---|---|
| Get wallet | `GET` | `/admin/wallets/:userId` |
| Wallet transactions | `GET` | `/admin/wallets/:userId/transactions` |
| Top up | `POST` | `/admin/wallets/:userId/topup` |
| Manual adjustment | `POST` | `/admin/wallets/:userId/adjustment` |

> ⚠️ **GAP — the 3 summary cards (Total Payments / Commissions Collected / Net Profit):** see Open Questions §B below.

---

## 5. Communication

### Tab: Notifications  →  module `admin/broadcasts`
| Action | Method | Path |
|---|---|---|
| Send notification | `POST` | `/admin/broadcasts` |
| List notifications | `GET` | `/admin/broadcasts` |
| Notification details | `GET` | `/admin/broadcasts/:id` |
| Delete notification | `DELETE` | `/admin/broadcasts/:id` |

- **List query:** `q`, `sort` = `newest`\|`oldest`.
- **Send body:**
  ```json
  {
    "titleAr": "required", "titleEn": "optional",
    "bodyAr": "required",  "bodyEn": "optional",
    "audience": { "kind": "ALL" }
  }
  ```
  `audience` is one of:
  - `{ "kind": "ALL" }`  → all users
  - `{ "kind": "ROLES", "roles": ["CUSTOMER", "SERVICE_PROVIDER"] }`
  - `{ "kind": "USERS", "userIds": ["..."] }`  (max 1000)
  - Valid roles: `ADMIN, MANAGER, SUPERVISOR, COMPANY_USER, ACCOUNTANT_MANAGER, CUSTOMER, SERVICE_PROVIDER`.

#### "Specific Users" picker — user lookup
Admins don't know raw user IDs. Back the "Specific Users" field with a type-ahead
search, then send the chosen `id`s in `audience.userIds`.

| Action | Method | Path |
|---|---|---|
| Search users | `GET` | `/admin/users/lookup` |

- **Query:** `q` (required, ≥2 chars — name / email / phone), `role` (optional: `CUSTOMER` \| `SERVICE_PROVIDER`), `limit` (default 10, max 25).
- **Response:** `{ "success": true, "items": [ { "id", "nameAr", "nameEn", "email", "phone", "role" } ] }`
- Scope is limited to `CUSTOMER` + `SERVICE_PROVIDER` (a marketplace admin can't enumerate staff accounts).
- Recommended UX: replace the raw-ID textarea with a search box → user types email/name → picks from results → frontend collects the `id`s. The broadcast contract is unchanged.

### Tab: Disputes  →  module `admin/disputes`
| Action | Method | Path |
|---|---|---|
| List disputes | `GET` | `/admin/disputes` |
| Dispute details | `GET` | `/admin/disputes/:id` |
| Update status / respond | `PATCH` | `/admin/disputes/:id` |

- **List query:** `q`, `status` = `PENDING`\|`IN_REVIEW`\|`RESOLVED`, `filerRole` = `CUSTOMER`\|`SERVICE_PROVIDER`, `sort` = `newest`\|`oldest`.
- **Update body:** `{ "status": "IN_REVIEW", "adminResponse": "text" }` (any combination, ≥1 required).
  - The "Status Management" buttons (In review / Pending / Resolved) + "Admin Response" textbox both hit this one endpoint.
  - The detail response includes the complaint photos shown in the modal.

---

## Open Questions / Gaps (need a decision before frontend can finish)

### A. "Add Subcategory" modal has no matching endpoint
The design treats **Subcategory** as its own entity that belongs to a **Category**
and has its own **price** (`Add Subcategory` modal = Category dropdown + name + price).

The backend does **not** model it that way. Subcategories live **inside a Service**
(`/admin/services`) as a nested array and are created/replaced through the Service's
`subcategories` field — there is **no** standalone Subcategory-under-Category CRUD.

**Decision needed:** either
1. Frontend manages subcategories through the Service create/update payload (no separate modal flow against the backend), **or**
2. Backend adds a real `Subcategory` entity + endpoints (`POST/GET/PATCH/DELETE /admin/subcategories`) tied to a Category.

### B. Financial summary cards — ✅ DONE
Built as `GET /admin/financial/summary` (see §4 above). One assumption to confirm:
`netProfit` currently equals `commissionsCollected` because there is no operating-cost
ledger. If the platform tracks costs, tell us and we'll subtract them.

### C. Withdrawal "Phone Number" shows `-`
Not a bug. `GET /admin/withdrawals` already returns the provider under the **`sp`**
key including `sp.phone`. The seeded test provider just has `phone: null`, so the
column renders `-`. Real providers with a phone will display it. (Note the key is
`sp`, not `provider`.) FRD §3.5.2 also lists "Total Wallet Balance" for this screen —
the list does **not** include wallet balance yet; tell us if the design needs it.

# Management System — Domain Map

> This document is the high-level architectural map of the Bareeq Management
> System. It does **not** contain final field types — those live in the Prisma
> schema. It describes **which entities exist, why they exist, and how they
> relate to each other**.

---

## Reading guide

1. **Cross-cutting decisions** apply to every domain (i18n, soft delete, IDs, etc.). Read them first.
2. **Build order** tells you which domains we implement in which sequence.
3. **Domains** are presented in build order. Each section lists entities, key relationships, and open questions.
4. **Open questions** at the end summarise everything we still need to decide.

For visual ERDs, paste `erd.dbml` into [dbdiagram.io](https://dbdiagram.io).

---

## Cross-cutting design decisions

These rules apply to every table in the system unless explicitly noted.

### 1. Bilingual fields use two columns

Anywhere data is multilingual (branch names, region names, category names, reasons, etc.), we use two columns:

```
name_ar  String   (required — primary language)
name_en  String?  (optional — falls back to name_ar at the API layer)
```

**Why:** simple Prisma typing, native SQL search, easy migrations. JSON columns and translation tables were considered and rejected as overkill for this scope.

### 2. Soft delete everywhere

Every table has a `deleted_at` (DateTime, nullable) column. Deleting a record sets the timestamp; queries filter it out by default.

**Why:** the FRD requires "All changes are logged and reappear in the system for record-keeping." Hard deletes would lose history.

### 3. Standard timestamps

Every table has `created_at` and `updated_at`.

### 4. IDs are CUIDs

Every primary key is a string CUID (`@default(cuid())`).

**Why:** CUIDs are sortable (good for indexes), short (24 chars), and safe to expose in URLs. They beat both auto-increment integers (which leak business size) and UUIDs (which are longer and slow inserts at scale).

### 5. Visit immutability is enforced in the service layer

Once a `Visit` row reaches a final status (Implemented, Not Implemented, Final Closed), the status field cannot change. Edits to images or reasons are tracked in `audit_logs`.

**Why:** the FRD makes immutability an explicit business rule. Database constraints alone can't express "status can change A→B but not B→A".

### 6. One `users` table for all roles

Single table with a `role` enum (`ADMIN`, `MANAGER`, `SUPERVISOR`, `COMPANY_USER`). Role-specific data hangs off via foreign keys when needed.

**Why:** ~80% of auth code (login, password reset, JWT) is identical across roles. Separate tables would mean four copies of the same logic.

### 7. Branch managers are NOT users

Branch managers document visits via a one-time signed link + SMS OTP — they have no account. Their phone number is stored on the `visits` table directly. The OTP lives in Redis (5-minute expiry), not in PostgreSQL.

**Why:** the FRD doesn't require branch managers to log in or see history — only to document a single visit on demand.

### 8. Audit log is one table for the whole system

A single `audit_logs` table captures sensitive changes across all domains (visit status changes, role changes, contract edits, etc.).

**Why:** centralised audit trail is easier to query and report on than per-table history columns.

---

## Build order

| Phase | Domain | Why this order |
|-------|--------|----------------|
| 1 | Identity & Access | Everything else needs `users` to exist |
| 2 | Catalog | Lookups (regions, reasons) are referenced by branches and visits |
| 3 | Companies & Branches | Foundation for the schedule and visit tables |
| 4 | Scheduling | The schedule generates visit slots |
| 5 | Visit Execution | The largest, most complex domain |
| 6 | Additional Tasks | Builds on the visit lifecycle |
| 7 | Notifications | Cross-cutting; needed by most domains once they exist |
| 8 | Sales | Standalone manager feature |
| 9 | Fleet (Cars) | Standalone manager feature |
| 10 | Representatives | Standalone manager feature |
| 11 | Admin Operations | Admin tasks for managers + contact messages |
| 12 | Audit | Wired up as we implement, finalised last |

---

## Domain 1 — Identity & Access

### Entities

| Entity | Purpose |
|--------|---------|
| `users` | All accounts: admins, managers, supervisors, company users |
| `permission_roles` | Dynamic roles created by admin (e.g. "Reports Admin", "Sales Manager") |
| `permissions` | Fixed catalog of capabilities (e.g. `MANAGE_SUPERVISORS`, `EXPORT_REPORTS`) |
| `permission_role_permissions` | Many-to-many between `permission_roles` and `permissions` |
| `refresh_tokens` | JWT refresh tokens for active sessions |

### Key relationships

- A `user` has one `permission_role` (only meaningful for admins/managers; supervisors/companies have fixed capabilities).
- A `permission_role` has many `permissions` (M:N).
- A `user` has many `refresh_tokens` (one per device).

### Open questions

- Should we store hashed OTPs in Redis or plain (acceptable since they're 5-minute, single-use)?
- Do we need separate refresh-token tables per role, or is one table sufficient?

---

## Domain 2 — Catalog

### Entities

| Entity | Purpose |
|--------|---------|
| `regions` | Geographic regions (e.g. Riyadh, Eastern Province) |
| `cities` | Cities within regions |
| `not_implemented_reasons` | Admin-managed list of reasons for "Not Implemented" visits |
| `categories` | Optional branch categorisation (e.g. "Hypermarket", "Express") |

### Key relationships

- A `city` belongs to one `region`.
- A `branch` references one `region` and one `city`.
- A `visit` marked "Not Implemented" references one `not_implemented_reason`.

### Open questions

- Are categories needed at all? FRD treats them as optional everywhere. We can skip and add later if requested.

---

## Domain 3 — Companies & Branches

### Entities

| Entity | Purpose |
|--------|---------|
| `companies` | Client organisations whose branches are visited |
| `branches` | Individual branch locations |
| `branch_required_tasks` | The checklist a supervisor must complete during each visit type |

### Key relationships

- A `company` has many `branches`.
- A `branch` has many `branch_required_tasks` (one per visit type, e.g. V1 has 5 tasks, V2 has 3).
- A `branch` belongs to a `region` and a `city`.
- A `branch` may belong to one `category` (optional).

### Notes

- A branch's "name" is conceptually `company.name + branch.name + category.name` (the FRD calls this "Brand Name").
- Branches have a `visits_per_month` count (1-4) that drives schedule generation.

### Open questions

- How does a branch's `code` get assigned? FRD shows it as a search field but doesn't define its origin.
- Do branches need their own coordinates, or do we just store an address + Google Maps link?

---

## Domain 4 — Scheduling

### Entities

| Entity | Purpose |
|--------|---------|
| `monthly_schedules` | One per supervisor per month |
| `scheduled_visits` | Individual visit slots: branch + visit-type + scheduled date |

### Key relationships

- A `monthly_schedule` belongs to one `user` (supervisor) and covers one `(year, month)`.
- A `monthly_schedule` has many `scheduled_visits`.
- A `scheduled_visit` references one `branch`, has a `visit_type` (V1/V2/V3/V4) and a `scheduled_date`.

### Notes

- The system auto-distributes dates: 2 visits → 15 days apart; 3+ visits → evenly across the month.
- A scheduled_visit is the "appointment". The actual `visit` row (Domain 5) is created when the supervisor takes action.

### Open questions

- If the admin imports the same supervisor's schedule via Excel twice in the same month, do we replace, merge, or reject?

---

## Domain 5 — Visit Execution (the heart)

### Entities

| Entity | Purpose |
|--------|---------|
| `visits` | The actual visit record: status, timing, GPS, branch manager phone |
| `visit_photos` | 3–4 photos uploaded per implemented visit |
| `visit_task_completions` | Which `branch_required_tasks` were marked done |
| `visit_documentations` | The branch manager's documentation: job number, rating, comments, OTP used |

### Key relationships

- A `visit` belongs to one `scheduled_visit` **OR** one `additional_task` (polymorphic — exactly one).
- A `visit` has many `visit_photos` (0–4).
- A `visit` has many `visit_task_completions` (matches the branch's required tasks for that visit type).
- A `visit` has zero or one `visit_documentation`.
- A `visit` references one `not_implemented_reason` if status is `NOT_IMPLEMENTED`.

### Lifecycle (state machine)

```
REMAINING ──┬──► UNDERWAY ──► IMPLEMENTED ──► (optionally) DOCUMENTED
            │
            ├──► NOT_IMPLEMENTED   (with reason)
            │
            └──► FINAL_CLOSED      (cascades: all later visits for this branch
                                    auto-marked NOT_IMPLEMENTED)
```

### Notes

- **Immutability:** once status leaves `REMAINING` or `UNDERWAY`, it's locked. Photos and reasons can be edited; status, start/end times, and duration cannot.
- **Order enforcement:** V2 cannot be started until V1 reaches a final status (Implemented, Not Implemented, or Final Closed).
- **Final Closed cascade:** marking V1 as Final Closed auto-creates `visits` rows for V2, V3, V4 with status `NOT_IMPLEMENTED`.

### Open questions

- Where do photos live? Cloudinary URLs in the DB, or local during dev?
- How long do we keep photos? Forever or with a retention policy?
- What's the exact polymorphic shape for `visit.owner` — two nullable FKs with a check constraint, or a discriminator + ID?

---

## Domain 6 — Additional Tasks

### Entities

| Entity | Purpose |
|--------|---------|
| `additional_tasks` | Extra visits assigned by manager to supervisor outside the monthly schedule |

### Key relationships

- An `additional_task` is assigned by one `user` (manager) to one `user` (supervisor).
- An `additional_task` references one `branch` (or freeform address if branch isn't in the catalog — TBD).
- An `additional_task` has one `visit` (sharing the same execution lifecycle as scheduled visits).

### Open questions

- Is the branch always from the catalog, or can managers enter any address ad-hoc? FRD examples show structured branches.
- Does an additional task have a `price` field that affects manager commission? FRD §3.9.2 mentions price but its purpose is unclear.

---

## Domain 7 — Notifications

### Entities

| Entity | Purpose |
|--------|---------|
| `notifications` | The notification content (title, body, type, created_at) |
| `notification_recipients` | Which users received this notification + read status |
| `notification_tokens` | FCM device tokens per user |

### Key relationships

- A `notification` has many `notification_recipients` (M:N to `users`).
- A `user` has many `notification_tokens` (one per device).

### Notes

- Push notifications go through FCM. Email/SMS are separate channels we wire later.
- Some notifications target a single user (e.g. "Your visit was approved"); some target a role group (e.g. "New schedule published" → all supervisors).

---

## Domain 8 — Sales

### Entities

| Entity | Purpose |
|--------|---------|
| `sales_clients` | Client contracts a manager has closed |
| `contract_types` | Lookup (admin-managed) |
| `tax_types` | Lookup (admin-managed) |
| `contract_statuses` | Lookup (admin-managed) |

### Key relationships

- A `sales_client` belongs to one `user` (manager who created it).
- A `sales_client` references one `contract_type`, one `tax_type`, one `contract_status`.

### Notes

- Standalone domain — no dependencies on visits or branches.

---

## Domain 9 — Fleet (Cars)

### Entities

| Entity | Purpose |
|--------|---------|
| `car_cases` | Vehicle records assigned to supervisors |
| `areas` | Lookup (admin-managed) |
| `license_plates` | Lookup (admin-managed) |
| `vehicle_conditions` | Lookup (admin-managed) |

### Key relationships

- A `car_case` is assigned to one `user` (supervisor).
- A `car_case` references one `area`, one `license_plate`, one `vehicle_condition`.

---

## Domain 10 — Representatives

### Entities

| Entity | Purpose |
|--------|---------|
| `representatives` | Worker-hour service agreements with clients |
| `service_types` | Lookup with hourly rate and worker count config |

### Key relationships

- A `representative` is created by one `user` (manager).
- A `representative` references one `service_type`.
- Price = `service_type.hourly_rate * num_workers * num_hours` (calculated, not stored — derived).

### Open questions

- Is `price` stored as a snapshot at creation time (in case rates change) or always derived?

---

## Domain 11 — Admin Operations

### Entities

| Entity | Purpose |
|--------|---------|
| `admin_tasks` | Tasks the admin assigns to a manager (Done / Not Done) |
| `contact_messages` | Form submissions from companies to admins |

### Key relationships

- An `admin_task` is assigned by one `user` (admin) to one `user` (manager).
- A `contact_message` is sent by one `user` (company) and may be replied to by one `user` (admin).

---

## Domain 12 — Audit

### Entities

| Entity | Purpose |
|--------|---------|
| `audit_logs` | Append-only log of sensitive changes across the system |

### Captured events (initial set)

- Visit status changes
- Visit detail edits (reason updates, photo changes)
- User role/status changes
- Contract edits in Sales

### Notes

- Single table with `entity_type`, `entity_id`, `action`, `actor_user_id`, `before_json`, `after_json`, `created_at`.
- Append-only — never UPDATE or DELETE rows.

---

## Open questions — full list

Collect answers as we go. Don't block early phases on later-domain questions.

| # | Question | Domain | Blocks |
|---|----------|--------|--------|
| 1 | Hashed or plain OTP in Redis? | Identity | Phase 5 (OTP flow) |
| 2 | One refresh-token table or per-role? | Identity | Phase 1 (Auth) |
| 3 | Are branch categories needed at all? | Catalog | Phase 3 |
| 4 | Source of branch `code` field? | Branches | Phase 3 |
| 5 | Branch coordinates or just address? | Branches | Phase 3 |
| 6 | Re-import behaviour for monthly schedules? | Scheduling | Phase 4 |
| 7 | Photo storage strategy and retention? | Visits | Phase 5 |
| 8 | Polymorphic `visit.owner` shape? | Visits | Phase 5 |
| 9 | Additional tasks: catalog branch only or freeform? | Additional Tasks | Phase 6 |
| 10 | Additional task `price` purpose? | Additional Tasks | Phase 6 |
| 11 | Representative price: snapshot or derived? | Representatives | Phase 10 |

---

## Glossary

| Term | Meaning in this project |
|------|-------------------------|
| Visit | A single scheduled or additional visit by a supervisor to a branch |
| Visit Type | V1, V2, V3, V4 — the sequence number of the visit within the month |
| Brand Name | `company.name + branch.name + (category.name)` — used in display and reports |
| Documented | A visit with branch manager attestation (job number, rating, comments) |
| Underway | A visit started but not yet implemented |
| Final Closed | A branch permanently closed; no further visits expected |
| Required Task | A checklist item the supervisor must verify during a visit |

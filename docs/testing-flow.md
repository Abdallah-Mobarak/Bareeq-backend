# Bareeq API — Manual Testing Flow

This is the recommended order to test the system end-to-end. Use it with the Postman / API Dog collection in `docs/postman/`, or manually with curl.

---

## Setup (once)

1. Make sure Postgres is running and the DB exists.
2. Run migrations: `npm run prisma:migrate`
3. Seed the bootstrap admin: `npm run seed:admin`
4. Start the server: `npm run dev`
5. Import the collection + environment file in Postman / API Dog:
   - `docs/postman/bareeq-api.postman_collection.json`
   - `docs/postman/bareeq-api.postman_environment.json`
6. Select the **Bareeq Local** environment in the top-right.

---

## Phase 1 — Auth sanity

| # | Request | Expected | What it proves |
|---|---------|----------|----------------|
| 1 | `GET /health` | 200, `checks.database.ok=true` | Server up, DB connected |
| 2 | `POST /auth/web/login` (admin creds) | 200, returns access + refresh + user | Login works, tokens auto-saved |
| 3 | `GET /auth/me` | 200, returns admin user | Bearer auth works |
| 4 | `POST /auth/refresh` | 200, NEW tokens | Refresh rotation works |

Re-run #2 to refresh tokens after a long pause; tokens expire after 15 min.

---

## Phase 2 — Catalog setup

Build the prerequisite data needed for branches.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 5 | `POST /regions` | 201 | Captures `regionId` |
| 6 | `POST /cities` (with regionId) | 201 | Captures `cityId` |
| 7 | `POST /reasons` | 201 | Captures `reasonId` (used later for visits) |
| 8 | `POST /categories` | 201 | Captures `categoryId` (optional FK on branches) |

**Edge cases to verify:**
- Try `POST /cities` with bogus `regionId` → expect 400 "Region not found"
- Try `DELETE /regions/{regionId}` while a city exists → expect 409 "Region has active cities"

---

## Phase 3 — Users

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 9 | `POST /managers` | 201 | Captures `managerId` |
| 10 | `POST /supervisors` | 201 | Captures `supervisorId` |
| 11 | `POST /companies` | 201 | Atomically creates Company + login User |
| 12 | `POST /auth/web/login` (with company creds) | 200 | Verify company can log in (FRD §2 — Companies are mobile+web, web tested here) |
| 13 | `POST /auth/web/login` (with manager creds) | 200 | Verify manager can log in |

**After step 13, switch the login back to admin** so the rest of the flow uses the admin token.

**Edge cases:**
- `POST /managers` with same email again → 409 "Email or phone already in use"
- `PATCH /managers/{id}/status` to BLOCKED, then `POST /auth/web/login` as that manager → 403 "Account is blocked"
- Re-enable: `PATCH /managers/{id}/status` to ENABLED → login works again

---

## Phase 4 — Branches (the orchestration)

This is where everything comes together. Branches reference 4 different FKs.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 14 | `POST /branches` | 201 | Uses `companyId` + `categoryId` + `regionId` + `cityId` + 3 nested required tasks |
| 15 | `GET /branches` | 200, list with 1 item | Includes nested `company`, `category`, `region`, `city`, `requiredTasks` |
| 16 | `GET /branches/:id` | 200 | Same shape as list item |
| 17 | `PATCH /branches/:id` | 200 | Replace `requiredTasks` array with a new one — old ones disappear |

**Edge cases:**
- `POST /branches` with bogus `companyId` → 400 "Company not found"
- `POST /branches` with `regionId=A` and `cityId=B` where city.regionId != A → 400 "City does not belong to the given region"
- `DELETE /companies/{companyId}` while a branch exists → 409 "Company has active branches"

---

## Phase 5 — Cleanup (in reverse dependency order)

You must delete in this order because of cascade-protection rules.

| # | Request | Why this order |
|---|---------|----------------|
| 18 | `DELETE /branches/{branchId}` | Detach branches first |
| 19 | `DELETE /companies/{companyId}` | Now allowed (no active branches) |
| 20 | `DELETE /managers/{managerId}` | Independent |
| 21 | `DELETE /supervisors/{supervisorId}` | Independent |
| 22 | `DELETE /cities/{cityId}` | Detach cities before regions |
| 23 | `DELETE /regions/{regionId}` | Now allowed |
| 24 | `DELETE /categories/{categoryId}` | Standalone |
| 25 | `DELETE /reasons/{reasonId}` | Standalone |

---

## Quick smoke test (5 min)

If you only have 5 minutes and want to verify the system is alive:

1. `POST /auth/web/login` (admin)
2. `GET /auth/me` (verify Bearer auth)
3. `POST /regions` (verify writes)
4. `GET /regions` (verify reads + pagination)
5. `DELETE /regions/{regionId}` (verify deletes)
6. `POST /auth/logout` (verify session ends)

If all five return success codes and the DB shows the soft-deleted row, the core stack is healthy.

---

## Common gotchas

- **Token expired (15 min):** the access token only lives 15 minutes. Hit `POST /auth/refresh` with the saved refresh token to get a fresh pair.
- **`Validation failed` on email:** Joi accepts internal TLDs like `@bareeq.local` because we use a permissive regex. If you still get a validation error, check the body shape against the request examples.
- **`Route not found` after restart:** make sure no orphan `node` process is holding port 3000. `Get-NetTCPConnection -LocalPort 3000` to check on Windows.
- **Arabic looks like `???`:** that's the Windows console code page, not a data issue. Open Prisma Studio (`npm run prisma:studio`) and you'll see Arabic correctly.

---

## After this flow passes

You can hand the API to a frontend / mobile dev with confidence. Send them:
1. The collection JSON (so they have working examples)
2. Their own admin credentials (created by `npm run seed:admin`)
3. The base URL of your dev server

Phase 4 (Scheduling) and Phase 5 (Visit Lifecycle) endpoints will appear in the collection as we build them. The pattern stays the same: import, set environment, run.

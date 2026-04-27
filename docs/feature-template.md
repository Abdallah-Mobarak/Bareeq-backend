# Feature Spec Template

Fill this in, then paste it after `AI_HANDOFF.md` to a fresh ChatGPT / Gemini chat.

---

## Feature name
[short title, e.g. "Managers Management"]

## FRD reference
[section number and 1-line summary, e.g. "§4.2.1 — Admin manages managers (CRUD + role assignment + status toggle)"]

## Goal
[one sentence — what value this feature gives the user]

## Endpoints required

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/v1/managers | requireAuth + requireRole('ADMIN') | list managers (paginated, searchable) |
| POST | /api/v1/managers | requireAuth + requireRole('ADMIN') | create a manager |
| GET | /api/v1/managers/:id | requireAuth + requireRole('ADMIN') | detail view |
| PATCH | /api/v1/managers/:id | requireAuth + requireRole('ADMIN') | update profile fields |
| DELETE | /api/v1/managers/:id | requireAuth + requireRole('ADMIN') | soft delete |
| PATCH | /api/v1/managers/:id/password | requireAuth + requireRole('ADMIN') | change password |
| PATCH | /api/v1/managers/:id/status | requireAuth + requireRole('ADMIN') | enable / block |

## Models to add or change

[only what's new — don't redeclare existing models]

```prisma
// example
model Manager {
  // ...
}
```

If only `User` columns are needed (e.g. you're using the existing `User` table because `role = MANAGER`), say so explicitly.

## Fields per request body

For each endpoint that takes a body, specify:

- POST /managers
  - `email` (required, valid email, unique)
  - `phone` (required, Saudi format)
  - `password` (required, min 8)
  - `nameAr` (required)
  - `nameEn` (optional)
  - `permissionRoleId` (optional, must reference a `permission_role` where `appliesTo = MANAGER`)

## Search / filter / sort

[from FRD §X.Y]

- Search by: email, phone, nameAr, nameEn
- Filter by: status, permissionRoleId
- Sort by: createdAt desc (default)
- Pagination: `?page=1&limit=20`

## Authorization rules

- Caller must have `role = ADMIN`.
- An admin cannot delete or block themselves (return 400).
- Email and phone must be unique across the entire `users` table (not just `MANAGER`s).

## Edge cases / business rules

- Soft-deleted managers cannot log in.
- Blocking a manager does not revoke their existing refresh tokens — they expire naturally. (Optional: revoke them on block — ask the lead.)
- When a manager is soft-deleted, their `refresh_tokens` should be revoked (`revokedAt = now()`).
- Password change requires the new password to differ from the current one.

## Notifications to fire (if any)

- On create: send "Welcome — your account is ready" (email channel — TBD).
- On password change by admin: send "Your password was reset by an admin".
- (Notifications module isn't built yet — emit a `logger.info` with the event for now and leave a `// TODO: notification` comment.)

## Test plan (curl scenarios you must demonstrate)

1. Login as admin → use that access token for all later calls.
2. Create a manager → 201 + body returns `{ user: {...} }` without `password`.
3. Create a duplicate (same email) → 409 conflict.
4. List managers → returns paginated list, `data.items` and `data.total`.
5. Get the new manager → 200.
6. Update name → 200, change reflected.
7. Block the manager → 200; manager login attempt → 403 "Account is blocked".
8. Soft-delete the manager → 200; manager appears no longer in list; refresh tokens revoked.
9. Call any endpoint without an Authorization header → 401.
10. Call any endpoint with a SUPERVISOR access token → 403 "Insufficient role".

## Output expected from you (the AI)

1. The diff for `prisma/schema.prisma` (only new lines — don't rewrite the file).
2. The exact migration command, e.g. `npx prisma migrate dev --name add_managers_management`.
3. Full content of `src/modules/managers/managers.routes.js`.
4. Full content of `src/modules/managers/managers.controller.js`.
5. Full content of `src/modules/managers/managers.service.js`.
6. Full content of `src/modules/managers/managers.validation.js`.
7. The 1-line edit to `src/routes/index.js` to mount the routes.
8. The output of the 10 curl scenarios above (real or simulated).
9. Confirmation that `npm run lint` passes clean.

## Hard rules

- Read `AI_HANDOFF.md` first. Do not deviate from its conventions.
- Do not commit anything. The lead reviewer commits.
- Do not add new dependencies without justifying each one.
- Do not invent endpoints not listed above.
- If any rule conflicts with the FRD, **stop and report it** — don't choose for me.

# AI Handoff — Bareeq Backend

You are continuing development on an active Node.js project. **Read this entire document before writing a single line of code.** The project lead reviews everything; deviating from these rules wastes everyone's time.

---

## 1. The project

Bareeq is a backend serving two systems from a single API:

1. **Management System** — field-visit tracking for supervisors / managers / admins / company users.
2. **Services Marketplace** — booking, payments, wallet (built later).

Full FRD is at `docs/management/domain-map.md` and `docs/management/erd.dbml`. The repo is on GitHub at `Abdallah-Mobarak/Bareeq-backend`.

The lead developer is **junior**. Code must be readable, conservative, and free of clever abstractions.

---

## 2. Tech stack — LOCKED (do not propose alternatives)

| Concern | Choice | Why locked |
|---------|--------|-----------|
| Runtime | Node.js 20+ | already configured |
| Language | **JavaScript only**, **CommonJS** (`require` / `module.exports`) | dev does not use TypeScript |
| Framework | Express 5 | NOT NestJS, NOT Fastify |
| ORM | **Prisma 6** | Prisma 7 broke `datasource.url` syntax — DO NOT upgrade |
| Database | PostgreSQL 17 | local dev |
| Validation | Joi | already wired into a middleware |
| Auth | jsonwebtoken (access) + opaque random refresh tokens | already implemented |
| Password hashing | bcryptjs (cost 10) | not the C `bcrypt` — Windows compat |
| Logger | pino (with pino-pretty in dev) | configured |
| Lint / format | ESLint 9 flat config + Prettier | both configured |

Do **NOT** install new ORMs, frameworks, auth libraries, or testing libraries without explicit approval.

---

## 3. Project structure (follow exactly)

```
src/
├── index.js                  process entry, graceful shutdown
├── app.js                    Express app, middleware order, /health
├── config/env.js             env loading + validation
├── utils/
│   ├── ApiError.js           the only error type to throw
│   ├── asyncHandler.js       wraps async controllers
│   ├── jwt.js                signAccessToken / verifyAccessToken
│   ├── password.js           hash / compare
│   └── logger.js             pino instance
├── middlewares/
│   ├── errorHandler.js
│   ├── notFound.js
│   ├── requestLogger.js
│   ├── validate.js           Joi-as-middleware
│   ├── requireAuth.js        Bearer JWT
│   └── requireRole.js        requireRole('ADMIN', 'MANAGER')
├── infrastructure/
│   └── database/prisma.js    SHARED PrismaClient singleton — do not create new ones
├── routes/
│   └── index.js              mounts modules
└── modules/
    └── auth/                 EXAMPLE pattern — copy this shape
        ├── auth.routes.js
        ├── auth.controller.js
        ├── auth.service.js
        └── auth.validation.js

prisma/
├── schema.prisma
└── migrations/

docs/
├── management/domain-map.md  design rationale
└── management/erd.dbml       full ERD
```

Every new business domain goes in `src/modules/{name}/` with the **same 4 files**.

---

## 4. Module pattern — non-negotiable

```
src/modules/{name}/
├── {name}.routes.js       — Router; declares URLs, applies middleware, calls controller
├── {name}.controller.js   — thin: read req, call service, send res. NO business logic
├── {name}.service.js      — business logic + DB calls. The brain.
└── {name}.validation.js   — Joi schemas (one per route that needs body/query/params input)
```

The controller must **not** call Prisma directly. The controller calls the service. The service calls Prisma.

---

## 5. Coding conventions — non-negotiable

### Database / Prisma
- **All IDs:** `String @id @default(cuid())` — never auto-increment integers, never UUIDs.
- **Bilingual fields:** two columns. `nameAr String` (required) + `nameEn String?` (optional). NOT JSON columns.
- **Soft delete on every model:** `deletedAt DateTime? @map("deleted_at")`. Queries must filter `deletedAt: null` by default.
- **Timestamps on every model:** `createdAt DateTime @default(now()) @map("created_at")` and `updatedAt DateTime @updatedAt @map("updated_at")`.
- **Naming:** model = PascalCase singular (`User`); fields = camelCase in code, snake_case in DB via `@map`; table = snake_case plural via `@@map`.
- **Indexes:** add `@@index` for any field used in `where` clauses you expect at scale.
- **Cascading:** prefer explicit `onDelete: Cascade` on join tables; don't cascade across business domains.

### Errors
- Throw `ApiError.badRequest('msg', detailsObject)`, `ApiError.notFound('msg')`, etc., from services.
- Never `throw new Error()` from a service — always `ApiError`.
- Never `console.log` from production code — use the `logger` from `utils/logger.js`.

### Responses
- Success: `res.json({ success: true, data: ... })`
- Errors: handled automatically by `errorHandler` middleware. Don't write custom error responses in controllers.

### Validation
- Every endpoint that accepts body / query / params goes through `validate(schema)`.
- Joi schemas use `{ abortEarly: false, stripUnknown: true }` (already the middleware default).

### Auth
- Public routes: declare them and document why.
- Protected routes: `router.get('/x', requireAuth, handler)`.
- Role-gated routes: `router.get('/x', requireAuth, requireRole('ADMIN'), handler)` (always after `requireAuth`).
- The JWT carries `{ sub, role, permissionRoleId }`. The middleware exposes them as `req.user.{ id, role, permissionRoleId }`.

### Async
- Wrap every async controller with `asyncHandler`. The errorHandler can't catch a rejected Promise otherwise.
- In services, always `await` Promises explicitly. ESLint will catch missing `await` if a function returns a Promise.

### Logging
- `logger.info({ contextObj }, 'human message')` — never log passwords, raw tokens, or full request bodies.
- `logger.error({ err }, 'msg')` for caught errors.

---

## 6. What's already built (Phase 1 — Identity & Access)

### Models
- `User` (single table for ALL roles via `SystemRole` enum: ADMIN, MANAGER, SUPERVISOR, COMPANY_USER)
- `PermissionRole`, `Permission`, `PermissionRolePermission` (dynamic RBAC for ADMIN / MANAGER)
- `RefreshToken` (opaque tokens, only SHA-256 hash stored)
- `SystemSetting` (key/value store for platform config)

### Endpoints (under `/api/v1/auth`)
| Method | Path | Auth |
|--------|------|------|
| POST | `/login` | public |
| POST | `/refresh` | public (rotates the refresh token) |
| POST | `/logout` | public |
| GET | `/me` | requireAuth |

### Bootstrap admin
- Email: `admin@bareeq.local`
- Password: `Admin@12345` (change immediately in prod)
- Created by: `npm run seed:admin` (idempotent)

---

## 7. Cross-cutting decisions already made

- **Single `users` table for all roles** — do not create per-role tables.
- **Branch managers are NOT users** — they document visits via signed link + SMS OTP. Their phone goes on `visit_instances` directly.
- **Visit immutability via `locked_at`** — once a `visit_instance` reaches a terminal status, the service-layer guard refuses any update if `locked_at IS NOT NULL`.
- **Scheduling is two-table:** `scheduled_visits` (admin's input) + `visit_instances` (system-generated V1/V2/V3...).
- **Additional tasks are scheduled_visits with `type = 'ADDITIONAL'`** — no separate domain.
- **One central `audit_logs` table** for all sensitive changes (do not add per-table change logs).

---

## 8. Open questions — DO NOT decide unilaterally

Ask the lead in your handoff if your feature touches any of these:

1. Hashed or plain OTP storage in Redis? (OTP flow not built yet.)
2. Are branch categories needed at all?
3. Source / format of branch `code` field?
4. Branch coordinates required, or address only?
5. Re-import behaviour for monthly schedules?
6. Ship `region_schedules` in v1 or defer?
7. Photo storage strategy and retention?
8. Additional tasks: catalog branch only or free-form addresses?
9. Additional task `price` purpose (commission)?
10. Representative price: snapshot or derived?

---

## 9. Workflow when adding a feature

1. Update `prisma/schema.prisma` with the new models / enums.
2. Run `npx prisma migrate dev --name descriptive_name` to generate + apply migration.
3. Create the four module files under `src/modules/{name}/`.
4. Mount the routes in `src/routes/index.js`.
5. Run `npm run lint:fix && npm run lint` — must be clean.
6. Test with at least 4 curl scenarios (happy path, validation error, auth error, role error).
7. **Do NOT commit.** Hand the diff + the curl outputs to the lead reviewer.

---

## 10. Things that get rejected at review

- TypeScript files, ESM imports, new frameworks
- New auth flows (extend the existing one)
- Mocking the database in tests
- `console.log` in production code
- Logging passwords / tokens / OTPs
- Hardcoded env values
- Missing soft delete
- Missing `requireAuth` on a protected route
- Polymorphic FKs without explicit reasoning
- New ORMs (we have Prisma)
- Premature optimisation, premature abstractions, premature caching
- Comments that explain WHAT the code does (only WHY-comments are kept)

---

## 11. Reference response shapes

### Success
```json
{ "success": true, "data": { ... } }
```

### Validation error (auto-shaped by `validate` middleware + errorHandler)
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [{ "field": "email", "message": "\"email\" is required" }]
  }
}
```

### Unauthorized
```json
{ "success": false, "error": { "message": "Invalid credentials" } }
```

### Not found
```json
{ "success": false, "error": { "message": "Resource not found" } }
```

---

## 12. Known gotchas — do not relearn the hard way

These are real bugs we've already paid for. Apply the workaround on the first try.

### Express 5: `req.query` is read-only
Direct assignment (`req.query = value`) is silently ignored. The `validate(schema, 'query')` middleware therefore stores its result on `req.validatedQuery`, not on `req.query`. **List / index endpoints must read from `req.validatedQuery`** (after the validate middleware has run). `req.body` and `req.params` remain writable and are replaced in place.

### Joi 18: `Joi.string().email()` rejects `.local` and many corp TLDs
Joi's email validator checks against the IANA TLD list, which omits internal-only TLDs like `.local`. Use a permissive regex pattern instead:

```js
Joi.string()
  .lowercase()
  .trim()
  .pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)
  .messages({ 'string.pattern.base': '"email" must be a valid email' })
  .required()
```

### Joi: type coercion must be explicit
The `validate` middleware passes `convert: true` so `?limit=5` becomes `5` (number) for a `Joi.number()` schema. If you ever bypass the middleware, remember to pass `convert: true` yourself.

### Reference list endpoint
Look at `src/modules/managers/managers.routes.js` and `managers.controller.js` for the canonical paginated list pattern (validate query → read req.validatedQuery → service runs `prisma.$transaction` for items + count).

---

## 13. When in doubt

Look at `src/modules/auth/` for auth flows and `src/modules/managers/` for CRUD + pagination. Copy their shape, naming, and style exactly.

If something is genuinely ambiguous, **stop and ask** rather than guess. The reviewer would rather answer one question than rewrite a feature.

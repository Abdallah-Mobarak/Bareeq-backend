# Bareeq Backend

Backend API for the Bareeq platform — a dual-system Node.js application:

1. **Management System** — Field visit management for supervisors, companies, managers, and admins.
2. **Services Marketplace** — Service booking platform with wallet, payments, and commission handling.

## Tech Stack

- **Runtime:** Node.js 20+ (developed on v24)
- **Language:** JavaScript (with JSDoc type hints)
- **Framework:** Express
- **Database:** PostgreSQL 17 + Prisma ORM
- **Cache / Queue:** Redis + BullMQ
- **File Storage:** Cloudinary
- **Push Notifications:** Firebase Cloud Messaging
- **SMS:** Taqnyat / Msegat
- **Payments:** PayTabs

## Project Structure

```
src/
├── config/           Environment config, constants
├── utils/            Shared utilities (logger, error classes)
├── middlewares/      Global Express middlewares
├── modules/          Business domain modules (auth, users, visits, etc.)
├── infrastructure/   External service wrappers (DB, SMS, storage, etc.)
└── routes/           Root router combining all modules

prisma/               Database schema and migrations
tests/                Jest tests
scripts/              Helper scripts (seeders, etc.)
logs/                 Application logs
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 17
- Redis (coming soon)
- Git

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in your values
cp .env.example .env

# 3. Create the database (one-time, via psql)
# psql -U postgres -c "CREATE DATABASE bareeq_dev;"

# 4. Generate Prisma client and run migrations
npm run prisma:migrate

# 5. Start the dev server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server with auto-reload on file changes |
| `npm start` | Start server in production mode |
| `npm run prisma:generate` | Regenerate Prisma client after schema changes |
| `npm run prisma:migrate` | Create and apply a new migration |
| `npm run prisma:studio` | Open Prisma Studio (visual DB editor) |
| `npm run lint` | Lint JavaScript files |
| `npm run format` | Auto-format code with Prettier |
| `npm test` | Run Jest test suite |

## Status

🚧 Under active development — Phase 0 (Bootstrap).

See [FRD](./docs/FRD.pdf) for full functional requirements.

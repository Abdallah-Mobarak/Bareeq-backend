# Bareeq — Documentation

Design notes, domain maps, and reference material for the Bareeq backend.

## Structure

```
docs/
├── README.md                  ← you are here
├── management/                ← Management System docs
│   ├── domain-map.md          ← high-level entity map and decisions
│   └── erd.dbml               ← visual ERD source (paste into dbdiagram.io)
└── services/                  ← Services Marketplace docs (added later)
```

## How to read these docs

1. Start with `management/domain-map.md` — it's the table of contents for
   the whole Management System.
2. Open `management/erd.dbml` and paste its contents into
   [dbdiagram.io](https://dbdiagram.io) for an interactive visual diagram.
3. Each domain section in `domain-map.md` lists the entities involved, the
   relationships, and any open questions.

## How these docs evolve

- The high-level map is written once and kept up to date.
- As we implement each domain, the actual Prisma schema becomes the source
  of truth for fields and types.
- These docs explain the **why** behind the schema. The schema explains the **what**.

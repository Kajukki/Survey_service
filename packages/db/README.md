# `packages/db`

PostgreSQL schema definitions, migrations, and data access types.

## Schema Generation

Use `kysely-codegen` to auto-generate TypeScript types from your database:

```bash
npx kysely-codegen --url postgresql://user:pass@host/dbname
```

This generates types in `src/index.ts` for use in `apps/api` and `apps/worker` queries.

## Migrations

SQL-based migrations live in `migrations/` using a file naming convention:

```
migrations/
├── 001_init_schema.sql
├── 002_add_shares_table.sql
├── 003_add_job_tracking.sql
└── ...
```

Run migrations in CI/CD before deploying new images, or via Flyway/Liquibase automation.

## Usage

In `apps/api` or `apps/worker`:

```typescript
import { Kysely } from 'kysely'
import { createDb } from '@survey-service/api/infra/db'

const db = createDb(config, logger)

// Use typed queries
const users = await db.selectFrom('users')
  .where('owner_id', '=', principal.userId)
  .select(['id', 'email', 'created_at'])
  .execute()
```

## Data Model

See [docs/architecture.md](../../docs/architecture.md) section 5 for ownership and sharing model.

- `users` — identity map
- `connections` — synced form providers
- `forms` — ingested forms
- `responses` — form responses (raw or normalized)
- `shares` — permission grants
- `jobs` — async job tracking

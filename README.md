# Survey Service

Internal tooling to ingest form and survey data from **Google Forms** and **Microsoft Forms**, store and analyze responses in **PostgreSQL**, and present results in a modern **Angular** frontend.

## Documentation

- [System architecture](docs/architecture.md)
- [Repository layout](docs/repository-structure.md)
- [Agent / workflow notes](AGENTS.md)

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/web` | Angular SPA |
| `apps/api` | REST/BFF (authz, enqueue sync jobs) |
| `apps/worker` | RabbitMQ consumers (sync + analysis) |
| `apps/scheduler` | Periodic enqueue (pairs with Kubernetes CronJob) |
| `packages/*` | Shared contracts, DB, messaging, connectors |
| `deploy/` | Dockerfiles and Kubernetes manifests |

## Prerequisites

- Node.js 20+
- PostgreSQL, RabbitMQ (for local/dev when implementations land)

## Toolchain

This monorepo uses npm workspaces with a shared TypeScript, ESLint, and Prettier baseline.

- Frontend (`apps/web`): Angular v21+ with `ng lint` and Prettier enforcement through ESLint.
- API and Worker (`apps/api`, `apps/worker`): Node.js TypeScript apps with ESLint and Prettier scripts.

## Common Commands

- Install dependencies: `npm install`
- Lint all apps: `npm run lint`
- Format all apps: `npm run format`
- Check formatting: `npm run format:check`
- Typecheck all apps: `npm run typecheck`

## Targeted Commands

- Frontend lint: `npm run lint:web`
- API lint: `npm run lint:api`
- Worker lint: `npm run lint:worker`
- Frontend format check: `npm run format:check:web`
- API format check: `npm run format:check:api`
- Worker format check: `npm run format:check:worker`

## Status

Repository structure and docs are scaffolded; application code is added incrementally.

## License

Private / internal — adjust as appropriate for your organization.

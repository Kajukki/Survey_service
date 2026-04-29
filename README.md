# Survey Service

Internal tooling to ingest form and survey data from **Google Forms** and **Microsoft Forms**, store and analyze responses in **PostgreSQL**, and present results in a modern **Angular** frontend.

## Current Capabilities

- Local full stack development with API, worker, frontend, PostgreSQL, and RabbitMQ.
- Local credential-based authentication flow (`register`, `login`, `refresh`) backed by database users and refresh tokens.
- RabbitMQ-backed sync job pipeline with persisted job lifecycle updates (`queued` -> `running` -> terminal state).
- Contract package updates for authentication payloads shared across apps.

## Current vs Target Auth Model

- Current implementation (this branch): local username/password session issuance for development and integration testing.
- Target architecture: enterprise IdP-based authentication and authorization model.
- Project docs now distinguish implemented behavior from target-state design to reduce drift.

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL + RabbitMQ
docker-compose up -d

# 3. Open three terminals and run:
npm --workspace @survey-service/api run dev          # Terminal 1: API (port 3000)
npm --workspace @survey-service/worker run dev       # Terminal 2: Worker (consumes jobs)
npm --workspace @survey-service/web run ng serve     # Terminal 3: Frontend (port 4200)
```

Then open `http://localhost:4200` in your browser.

For detailed walkthrough, see **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)**.

## Documentation

- [Local full-stack setup](LOCAL_DEVELOPMENT.md) — Running all services locally
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

- Node.js 24+
- Docker & Docker Compose (for local development)
- PostgreSQL 16+ and RabbitMQ 3.13+ (or use provided docker-compose)

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
- Test all apps: `npm run test`

## Targeted Commands

- Frontend lint: `npm run lint:web`
- API lint: `npm run lint:api`
- Worker lint: `npm run lint:worker`
- Frontend format check: `npm run format:check:web`
- API format check: `npm run format:check:api`
- Worker format check: `npm run format:check:worker`
- API tests: `npm --workspace @survey-service/api run test`

## Status

Core API, worker, and frontend flows are implemented for local development and integration.

Known in-progress areas:

- Dashboard focuses on form health/activity metrics; detailed question analytics live under the forms workspace endpoints.
 - Export artifact storage and signed URL delivery hardening is still in progress (current worker generates deterministic placeholder `download_url` values when exports reach `ready`; treat `download_url` as provisional until durable artifact storage and signed-URL delivery are implemented).
- Target enterprise IdP integration remains planned and is not the active runtime path.

## License

Private / internal — adjust as appropriate for your organization.


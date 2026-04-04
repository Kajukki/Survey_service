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

## Status

Repository structure and docs are scaffolded; application code is added incrementally.

## License

Private / internal — adjust as appropriate for your organization.

# Repository structure

This document proposes a **monorepo layout** aligned with [architecture.md](./architecture.md): Angular SPA, HTTP API, RabbitMQ workers, optional scheduler, shared libraries, PostgreSQL migrations, and Kubernetes/nginx deployment assets.

**Assumption:** TypeScript for API and workers (shared tooling and types with Angular). Adjust names if you choose another backend language.

---

## Design goals

1. **Deployable units** map 1:1 to architecture components (web, api, worker, scheduler).
2. **Shared contracts** (DTOs, job payloads, validation) live in one place to avoid drift between API and workers.
3. **Connectors** (Google, Microsoft) are isolated libraries consumed only by workers (and optionally API for OAuth callback/metadata).
4. **Messaging** topology (exchanges, queues, routing keys) is defined once and imported by API (publish) and workers (consume).
5. **Database** schema and migrations are single-sourced; API and workers use the same access layer or generated client.
6. **Kubernetes** manifests or Helm/Kustomize live under `deploy/` and reference images built from `apps/*`.

---

## Top-level layout

```text
.
├── docs/
│   ├── architecture.md
│   └── repository-structure.md    # this file
├── apps/
│   ├── web/                       # Angular SPA (standalone, signals-first per team skill)
│   ├── api/                       # REST/BFF: authz, CRUD, enqueue jobs, health
│   ├── worker/                    # RabbitMQ consumers: sync + analysis (see below)
│   └── scheduler/                 # Thin process OR scripts invoked by CronJob to enqueue periodic syncs
├── packages/
│   ├── shared/                    # Types, constants, cross-cutting utils (no IO)
│   ├── contracts/               # Job payloads, API request/response schemas (e.g. Zod), OpenAPI source
│   ├── db/                        # Schema, migrations, repository interfaces / query layer
│   ├── messaging/               # RabbitMQ: exchanges, queues, bindings, publisher, consumer bootstrap
│   └── connectors/              # google/, microsoft/ — provider API clients, token refresh helpers
├── deploy/
│   ├── docker/
│   │   ├── web.Dockerfile
│   │   ├── api.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── scheduler.Dockerfile
│   ├── k8s/                     # Kustomize bases + overlays, or Helm chart(s)
│   │   ├── base/
│   │   └── overlays/
│   │       ├── dev/
│   │       └── prod/
│   └── nginx/                   # Optional: snippet configs if not only Ingress annotations
├── tools/                       # Local dev scripts, codegen, db helpers
├── .github/
│   └── workflows/               # CI: lint, test, build images, migrate
├── package.json                 # Workspace root (npm/pnpm/yarn workspaces) OR separate per app
└── README.md
```

---

## Per-application notes

### `apps/web`

- Angular application: features for connections, forms, sync status, dashboards, sharing UI.
- Environment files point API base URL (behind nginx Ingress in prod).
- Optional generated **API client** from OpenAPI (`packages/contracts` or `packages/api-client`) to keep types aligned with `apps/api`.

### `apps/api`

- HTTP server only: authentication middleware, **owner + share** authorization, validation, enqueue to RabbitMQ (and optional **outbox** in `packages/db`).
- Does **not** embed long-running sync logic; delegates to `apps/worker` via messages.
- Exposes job IDs for manual sync (`202` + polling or future WebSocket).

### `apps/worker`

- Single codebase, **multiple deployment targets** is usually enough:
  - Same image with `WORKER_ROLE=sync|analysis` or separate **Deployments** with different args.
  - Alternatively split into `apps/worker-sync` and `apps/worker-analysis` if release cycles must diverge.
- Imports `packages/connectors`, `packages/db`, `packages/messaging`.
- Stateless pods; horizontal scaling via replica count / HPA.

### `apps/scheduler`

- Minimal: load active connections from DB (or config) and **publish** “scheduled sync” messages to RabbitMQ.
- Kubernetes **CronJob** runs this binary on a schedule; keeps parity with user-initiated job shape.

---

## Shared packages

| Package | Responsibility |
|---------|----------------|
| **`shared`** | Pure helpers, error types, result types, feature flags constants. |
| **`contracts`** | Zod (or equivalent) schemas for REST + RabbitMQ payloads; export TypeScript types; optional OpenAPI generation for `api` and `web`. |
| **`db`** | Migrations (e.g. Flyway-style SQL, Prisma, Drizzle, or Kysely); connection pool config; transactional outbox tables if used. |
| **`messaging`** | Declare exchanges (`sync`, `analysis`, `dlx`), queues, bindings, DLQ; shared serialization; retry/backoff policy constants. |
| **`connectors`** | `google/` and `microsoft/` subpackages: thin wrappers over provider SDKs/HTTP; no HTTP server. |

---

## Database and migrations

- **Single migration pipeline** in `packages/db` (or `packages/db/migrations`).
- Both `apps/api` and `apps/worker` depend on `packages/db` for entities and queries (or a generated query API).
- CI applies migrations before or as part of deploy (Job in Kubernetes).

---

## Deployment artifacts (`deploy/`)

- **Dockerfiles** per image: multi-stage builds; `web` serves static files via nginx image or embed in `web` stage.
- **Kubernetes**: Deployments for api, web, worker(s), scheduler CronJob; Service + Ingress (nginx); ConfigMaps/Secrets for DSN, RabbitMQ URI, OIDC; HPA manifests for api/worker.
- **Optional**: Helm umbrella chart or Kustomize with `dev`/`prod` overlays for image tags and replica counts.
- RabbitMQ and PostgreSQL are often **external** or separate charts; document dependency in README, not necessarily inside this repo’s chart if ops owns them.

---

## What this structure supports from the architecture

| Architecture concern | Where it lives |
|---------------------|----------------|
| User ownership + sharing | `apps/api` middleware + services; `packages/db` models and RLS/migrations |
| Manual + scheduled sync | `apps/api` enqueue; `apps/scheduler` + `apps/worker` |
| RabbitMQ | `packages/messaging`; `apps/api` publish; `apps/worker` consume |
| Google / Microsoft | `packages/connectors` |
| Analysis rollups | `apps/worker` (analysis role) + SQL in `packages/db` |
| Horizontal workers | Same `worker` image, scale Deployment |
| NGINX Ingress | `deploy/k8s` Ingress resources |
| Optional Redis | Deploy manifest + env; touch `apps/api` / `apps/worker` cache layer only when needed |

---

## Alternatives (if the repo grows)

- **Split repos** later: extract `packages/connectors` or `packages/messaging` to private npm packages if multiple services need them outside this monorepo.
- **BFF split**: keep one `api` until traffic or teams force a public API vs internal API split.

---

## Related document

- [architecture.md](./architecture.md) — system design and runtime behavior.

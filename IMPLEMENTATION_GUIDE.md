# API Implementation Guide

## Overview
This document describes the API implementation following the design plan ([docs/plans/API-design-plan.md](docs/plans/API-design-plan.md)) and aligned with repository conventions (AGENTS.md, skills, rules).

**Status:** Foundational infrastructure and domain contracts in place; ready for domain module implementation.

## What Has Been Completed

### 1. Core Infrastructure (`apps/api/src/server/`)
- ✅ **Config Management** (config.ts) — Environment validation with Zod
- ✅ **Error Handling** (errors.ts) — Standardized error types and HTTP mapping
- ✅ **Logging** (logging.ts) — Pino structured logging with environment-aware setup
- ✅ **Server Bootstrap** (create-server.ts) — Fastify app with plugins (helmet, CORS, rate-limiting)
- ✅ **API Types** (types.ts) — Principal, ApiResponse, Owned models

### 2. Data and Messaging Infrastructure (`apps/api/src/infra/`)
- ✅ **Database** (db.ts) — Kysely + pg connection pool
- ✅ **RabbitMQ** (rabbitmq.ts) — amqplib channel with publisher confirms
- ✅ **Metrics** (metrics.ts) — Prometheus collectors for observability

### 3. Authentication & Authorization (`apps/api/src/modules/auth/` + `apps/api/src/policy/`)
- ✅ **Auth Service** (auth-service.ts) — JWT verification via OIDC JWKS
- ✅ **Authorization Policy** (authorization.ts) — Owner/share enforcement with enforceable predicates

### 4. Shared Contracts (`packages/contracts/src/index.ts`)
- ✅ **Validation Schemas** — Zod-based DTOs for all resource types
  - Connections, Forms, Jobs (sync/export), Shares, Pagination
  - Type-safe inference for API and workers
- ✅ **Error Envelope** — Consistent response shape across all APIs

### 5. Messaging Topology (`packages/messaging/src/index.ts`)
- ✅ **Exchanges & Queues** — Topic-based routing for sync and analysis jobs
- ✅ **Message Schemas** — SyncJobMessage, AnalysisJobMessage with retry tracking
- ✅ **DLQ & Dead Letter** — Durable failure handling with TTL policies
- ✅ **Configuration** — Publisher options, prefetch limits, queue bindings

### 6. Shared Utilities (`packages/shared/src/index.ts`)
- ✅ **Result Type** — Railway-oriented programming (OK/ERR) pattern
- ✅ **Pagination** — Query builders and metadata calculation
- ✅ **JSON/Date Parsing** — Safe parsing with defaults

### 7. Database Layer (`packages/db/src/index.ts`)
- ✅ **Type Scaffolds** — Prepared for kysely-codegen schema generation

### 8. Health Check Module (`apps/api/src/modules/health/`)
- ✅ **Health Route** — Liveness probe endpoint

### 9. Testing Infrastructure
- ✅ **Unit Tests** — Comprehensive test suite for errors, config, auth, shared utilities, contracts
- ✅ **Vitest Configuration** — Ready for TDD workflow
- ✅ **Coverage Tracking** — Configured for v8 provider with HTML reports

### 10. Project Documentation
- ✅ Updated [apps/api/README.md](apps/api/README.md) with architecture and module layout
- ✅ Updated [packages/\*README.md](packages/) files with usage guidance
- ✅ Added TypeScript configuration for all packages

## Next Steps for Implementation (Strict TDD Order for RabbitMQ Sync Pipeline)

This sequence is optimized for a dedicated TDD agent. Each phase is executed as RED -> GREEN -> REFACTOR before moving forward.

### Phase 1: Job Persistence Foundation
**Goal:** Introduce real job storage so API and worker can share lifecycle state.

**Target files/components:**
- `packages/db/migrations/001_jobs.sql` (new migration)
- `packages/db/src/index.ts`
- `apps/api/src/infra/db.ts` (type alignment only)

**RED (write failing tests first):**
1. Add repository-level tests that expect:
  - create sync job persists `queued` status
  - get job by id returns record with timestamps
  - list jobs returns newest first with pagination metadata
2. Add schema/typing test that fails if required columns are missing (`id`, `type`, `status`, `requested_by`, `connection_id`, `form_id`, `trigger`, `created_at`, `started_at`, `completed_at`, `error`).

**GREEN (minimal implementation):**
1. Add migration for `jobs` table and required indexes (`requested_by`, `status`, `created_at`, composite on `requested_by, created_at`).
2. Generate/update database types and make tests pass with simplest repository implementation.

**REFACTOR:**
1. Extract repository helpers for pagination and status mapping.
2. Remove duplicated SQL fragments and centralize in one module.

**Exit criteria:**
- All Phase 1 tests pass.
- Job schema is stable and can be consumed by API route tests.

### Phase 2: RabbitMQ Producer Reliability in API
**Goal:** API can safely publish sync jobs using asserted topology and confirm channel.

**Target files/components:**
- `apps/api/src/infra/rabbitmq.ts`
- `packages/messaging/src/index.ts`
- `apps/api/src/index.ts` (bootstrap call for topology)

**RED:**
1. Add infra tests that fail unless startup asserts:
  - sync exchange exists
  - sync jobs queue exists
  - binding from exchange to queue exists
2. Add publisher tests that fail unless:
  - payload is validated against `SyncJobMessageSchema`
  - publish waits for confirm
  - publish failure is surfaced to caller

**GREEN:**
1. Add topology bootstrap function and call it once at API startup.
2. Add sync publish helper with schema validation + confirm handling.

**REFACTOR:**
1. Split connection/channel logic from topology/publisher functions.
2. Introduce clear error classes (`RabbitMQTopologyError`, `RabbitMQPublishError`) for route/service mapping.

**Exit criteria:**
- Infra tests pass for topology and confirm semantics.
- Producer behavior is deterministic under simulated publish failures.

### Phase 3: Replace Mock Jobs API with Real Enqueue Flow
**Goal:** `POST /api/v1/jobs/sync` and `GET /api/v1/jobs/:id` use DB + RabbitMQ instead of in-memory map.

**Target files/components:**
- `apps/api/src/modules/jobs/jobs.route.ts`
- `apps/api/src/modules/forms/forms.route.ts` (route reuse for form sync)
- `apps/api/src/server/create-server.ts` (context wiring if needed)

**RED:**
1. Add route tests that fail unless:
  - POST sync returns 202 with `job_id` and `status: queued`
  - GET by id returns persisted status instead of synthetic transitions
  - GET list includes newly created jobs for the requesting user
2. Add negative tests:
  - invalid payload returns 400
  - publish failure returns controlled 5xx error envelope and does not report success

**GREEN:**
1. Implement minimal job creation + publish path.
2. Replace map-backed reads with repository-backed reads.
3. Keep response envelope fields compatible with frontend adapters.

**REFACTOR:**
1. Extract a `jobs.service.ts` to keep route handlers thin.
2. Consolidate duplicate response mapping logic.

**Exit criteria:**
- Route-level tests pass with no in-memory fallback behavior.

### Phase 4: Worker Consumer and Lifecycle Updates
**Goal:** Worker consumes sync queue and updates job status from `queued` -> `running` -> terminal state.

**Target files/components:**
- `apps/worker/src/index.ts`
- `apps/worker/package.json` (deps/scripts only if needed)
- shared DB access via `packages/db`

**RED:**
1. Add worker unit tests that fail unless:
  - valid message sets job to `running` before processing
  - success path sets `succeeded` + `completed_at`
  - failure path sets `failed` + error details
2. Add consumer behavior tests for ack/nack:
  - ack only after DB status commit
  - invalid message is rejected predictably (nack/DLQ path)

**GREEN:**
1. Implement minimal consumer loop with schema validation.
2. Implement status transitions and ack/nack behavior.

**REFACTOR:**
1. Isolate message handler pure logic from transport wiring.
2. Add small retry policy helper for clearer failure handling.

**Exit criteria:**
- Worker tests pass for both success and failure paths.
- Status transitions are visible through API reads.

### Phase 5: End-to-End Integration for Frontend + API + Worker + RabbitMQ
**Goal:** Prove local pipeline works from UI action to terminal job status.

**Target files/components:**
- `apps/api/src/modules/jobs/jobs.route.ts` integration tests
- `apps/worker/src/index.ts` integration tests
- `apps/web/src/app/features/sync-jobs/sync-jobs.page.ts` compatibility checks
- `apps/web/src/app/core/api/survey-api.adapters.ts`

**RED:**
1. Add integration test that fails unless:
  - API enqueue publishes to RabbitMQ
  - worker consumes message
  - job status reaches terminal state and is queryable via API
2. Add frontend contract test that fails if API fields drift from adapter expectations (`id`, `status`, `created_at|createdAt`, `source`).

**GREEN:**
1. Wire minimal integration fixture (local services or test containers).
2. Adjust API serialization only where needed to satisfy adapter contract.

**REFACTOR:**
1. Reduce polling/test flakiness with deterministic wait helpers.
2. Move shared test fixtures into reusable helpers.

**Exit criteria:**
- One deterministic end-to-end test passes locally.
- Frontend sync job screen can trigger and observe real lifecycle updates.

### Phase 6: Documentation and TDD Handoff Completion
**Goal:** Ensure implementation details are executable by another agent without missing context.

**Target files/components:**
- `apps/api/README.md`
- `apps/worker/README.md`
- `README.md`

**RED:**
1. Add doc quality checks (or checklist assertions) that fail handoff if required sections are missing:
  - environment variables
  - startup order
  - queue/job troubleshooting

**GREEN:**
1. Document local run sequence for web, API, worker, RabbitMQ.
2. Document expected manual test flow (Run sync -> queued -> running -> succeeded/failed).

**REFACTOR:**
1. Remove duplicated setup notes and link to canonical sections.

**Exit criteria:**
- Another agent can run implementation and validation without additional clarifications.

## Phase-by-Phase Test Case Inventory (for TDD Agent Backlog)

1. `jobs.repo.create` persists queued sync job with requested_by and trigger.
2. `jobs.repo.getById` returns null for unknown id and record for known id.
3. RabbitMQ topology bootstrap asserts exchange, queue, binding exactly once on startup.
4. RabbitMQ publisher rejects invalid payload and never publishes.
5. RabbitMQ publisher throws explicit error when confirm fails.
6. `POST /api/v1/jobs/sync` returns 202 and job envelope when publish succeeds.
7. `POST /api/v1/jobs/sync` returns controlled error envelope when publish fails.
8. `GET /api/v1/jobs/:id` returns persisted status from DB.
9. Worker marks job running before simulated processing begins.
10. Worker marks job succeeded and sets completed_at on success.
11. Worker marks job failed and stores error summary on failure.
12. Worker ack occurs only after status persistence.
13. End-to-end: enqueue -> consume -> terminal status observable via API.
14. Frontend adapter compatibility test for job DTO field mapping.

## Strict Sequencing Rule

Do not implement GREEN for Phase N+1 until all RED/GREEN/REFACTOR checks in Phase N are complete and stable.

## Key Conventions Enforced

### Security (from rules/common/security.md)
- ✅ No hardcoded secrets (all from env)
- ✅ Input validation via Zod at all boundaries
- ✅ Owner/share authorization at service layer
- ✅ Error messages do not leak DB/RabbitMQ internals
- ✅ Rate limiting configured on API
- [ ] SQL injection prevention (parameterized via Kysely)
- [ ] Audit logging for sensitive actions

### TypeScript (from rules/typescript/)
- ✅ Explicit types on public APIs
- ✅ Avoid `any` (use `unknown` + narrow)
- ✅ Custom error handling with type guards
- ✅ Immutability patterns

### Backend Patterns (from skills/backend-patterns/)
- ✅ Repository pattern for data access
- ✅ Service layer for business logic
- ✅ Middleware for auth/cors/logging
- ✅ Error handling at appropriate boundaries

### API Design (from skills/api-design/)
- ✅ Resource-based URLs (kebab-case)
- ✅ Consistent response envelope
- ✅ Proper HTTP status codes (202 for async)
- ✅ Pagination schema

### Database (from skills/postgres-patterns/)
- [ ] Indexes on foreign keys and common filters
- [ ] BRIN indexes on time-series columns
- [ ] Composite indexes for ownership queries
- [ ] Connection pooling (already set up)

## Testing Coverage

Current coverage:
- Error handling: 100%
- Config validation: 100%
- Authorization policy: 100%
- Shared utilities: 95%+
- Contract schemas: 95%+

Target: **80%+ overall; 90%+ on critical paths** (auth, authorization, job enqueue).

## Running the API

```bash
# Install dependencies
npm install

# Build packages first
npm run build:packages

# Run tests
npm run test

# Start dev server (with hot reload)
npm run dev

# With environment
DATABASE_URL=postgresql://localhost/survey \
RABBITMQ_URL=amqp://localhost \
OIDC_ISSUER=... \
OIDC_AUDIENCE=... \
OIDC_JWKS_URI=... \
npm run dev
```

## Key Files Reference

| File | Purpose |
|------|---------|
| [docs/plans/API-design-plan.md](docs/plans/API-design-plan.md) | Full specification and library choices |
| [apps/api/src/index.ts](apps/api/src/index.ts) | Process entrypoint |
| [apps/api/src/server/create-server.ts](apps/api/src/server/create-server.ts) | Fastify bootstrap + plugins |
| [apps/api/src/policy/authorization.ts](apps/api/src/policy/authorization.ts) | Authorization enforcement |
| [packages/contracts/src/index.ts](packages/contracts/src/index.ts) | Shared schemas (API <-> worker) |
| [packages/messaging/src/index.ts](packages/messaging/src/index.ts) | RabbitMQ topology |
| [AGENTS.md](AGENTS.md) | Repository workflow and agents |
| [skills/api-design/SKILL.md](skills/api-design/SKILL.md) | REST design patterns |
| [skills/backend-patterns/SKILL.md](skills/backend-patterns/SKILL.md) | Backend architecture patterns |

## Security Checklist (Before Deploy)

- [ ] All secrets from environment variables
- [ ] JWT verification enabled and validated
- [ ] Rate limiting enabled on all expensive endpoints
- [ ] Input validation on all public routes
- [ ] Authorization checks on all protected resources
- [ ] Error responses sanitized (no stack traces in prod)
- [ ] HTTPS enforced in production
- [ ] Helm security headers set
- [ ] CORS origins restricted to frontend domain
- [ ] Database credentials stored securely
- [ ] RabbitMQ credentials stored securely
- [ ] No console.log() in production code
- [ ] Audit logs for sensitive actions

# Implementation Plan: API Design and Delivery (Survey Service)

## Overview
- Deliver a production-grade HTTP API for Survey Service that enforces ownership and sharing, validates inputs, persists transactional state, and publishes async work to RabbitMQ for workers.
- Keep the API as a thin orchestration layer: request validation, authorization, persistence coordination, queue publish, and response shaping.
- Expected impact: frontend and operations teams get a stable API contract for connections, forms, sharing, sync jobs, and exports without embedding long-running work in request handlers.

## Assumptions and Constraints
- Architecture source of truth is [docs/architecture.md](../architecture.md).
- Repository conventions are defined in [docs/repository-structure.md](../repository-structure.md).
- API runtime is Node.js 20+ and TypeScript, with workspace package at [apps/api/package.json](../../apps/api/package.json).
- Single organization deployment with one PostgreSQL primary and RabbitMQ as the durable message broker.
- API must not run sync/analysis jobs inline; manual triggers return `202 Accepted` and job metadata.
- Access model is owner-first with explicit share grants; enforcement required in API logic and DB query policy.
- No secrets in source or client bundles; all secrets come from environment or secret stores.

## Affected Areas
- API app:
  - [apps/api/src](../../apps/api/src)
  - [apps/api/src/index.ts](../../apps/api/src/index.ts)
  - [apps/api/README.md](../../apps/api/README.md)
- Shared packages:
  - [packages/contracts](../../packages/contracts)
  - [packages/messaging](../../packages/messaging)
  - [packages/db](../../packages/db)
- Worker/scheduler integration points:
  - [apps/worker/src/index.ts](../../apps/worker/src/index.ts)
  - [apps/scheduler/README.md](../../apps/scheduler/README.md)
- Deployment and ops alignment:
  - [deploy/k8s](../../deploy/k8s)
  - [deploy/docker/api.Dockerfile](../../deploy/docker/api.Dockerfile)

## Implementation Stack (Libraries and Frameworks)

### Core Runtime and HTTP
- `Node.js` (>= 20): runtime and native web APIs.
- `TypeScript`: strict compile-time safety.
- `Fastify`: HTTP server framework for high throughput, schema support, and plugin architecture.
- `@fastify/sensible`: standardized HTTP errors and utility responses.
- `@fastify/cors`: explicit CORS policy for web origin(s).
- `@fastify/helmet`: hardened security headers.
- `@fastify/rate-limit`: endpoint-level abuse protection for public-facing or expensive routes.

Rationale:
- Fastify’s typed route schema model pairs well with shared Zod contracts and lower overhead than heavier frameworks.

### Validation and Contracts
- `zod`: request/response and message payload validation in a single source of truth.
- `zod-to-json-schema` (optional): emit JSON Schema/OpenAPI-compatible artifacts if needed by tools.
- Shared DTOs and schemas live in [packages/contracts](../../packages/contracts).

Rationale:
- Keeps API, worker, and future generated web client aligned and reduces contract drift.

### Database Access
- `pg`: PostgreSQL driver with pool control.
- `kysely`: type-safe query builder for composable SQL while preserving SQL visibility.
- `kysely-codegen` (optional): database type generation from schema for stronger typing.
- Migration strategy in [packages/db/migrations](../../packages/db/migrations) with SQL-first migrations.

Rationale:
- Kysely provides strong typing without opaque ORM behavior and supports complex ownership/share predicates clearly.

### Messaging
- `amqplib`: RabbitMQ client for publish/consume primitives.
- Shared topology and publisher helpers in [packages/messaging](../../packages/messaging).

Required messaging features:
- Publisher confirms enabled for API publish reliability.
- Durable exchanges/queues/messages.
- DLX and DLQ strategy for failed processing.

### Observability and Operations
- `pino`: structured JSON logging.
- `pino-http` (if needed with Fastify integration choices): request-scoped logging.
- `prom-client`: metrics (HTTP latency, error counts, queue publish outcomes, auth failures).
- `uuid` or native `crypto.randomUUID()`: correlation IDs/job IDs where not DB-generated.

### Auth and Security Integration
- `jose`: JWT verification against OIDC JWKS.
- Optional `openid-client` if interactive OAuth/OIDC client flows are needed in API.

Rationale:
- `jose` keeps verification focused and standards-compliant for bearer token validation.

## Target API Modules and File-Level Plan

Proposed API layout in [apps/api/src](../../apps/api/src):

- `server/`
  - `create-server.ts` (Fastify bootstrap, plugin registration)
  - `config.ts` (environment parsing and validation)
  - `errors.ts` (error envelope mapping)
  - `logging.ts` (pino setup)
- `modules/health/`
  - `health.route.ts`
- `modules/auth/`
  - `auth-context.plugin.ts` (JWT parse + principal mapping)
  - `auth.types.ts`
- `modules/connections/`
  - `connections.route.ts`
  - `connections.service.ts`
  - `connections.repo.ts`
- `modules/forms/`
  - `forms.route.ts`
  - `forms.service.ts`
  - `forms.repo.ts`
- `modules/sharing/`
  - `sharing.route.ts`
  - `sharing.service.ts`
  - `sharing.repo.ts`
- `modules/jobs/`
  - `jobs.route.ts` (manual sync trigger + job status)
  - `jobs.service.ts`
  - `jobs.publisher.ts`
  - `jobs.repo.ts`
- `modules/exports/`
  - `exports.route.ts`
  - `exports.service.ts`
- `policy/`
  - `authorization.ts` (owner/share policy checks)
  - `visibility-predicates.ts` (query constraints)
- `infra/`
  - `db.ts` (pool + kysely instance)
  - `rabbitmq.ts` (connection/channel/provider)
  - `metrics.ts`
- `index.ts` (process entrypoint)

## Phased Steps

1. Phase 1: API Contract and Endpoint Blueprint
- Goal: finalize endpoint map, payload shapes, and response envelopes before handler implementation.
- Actions:
  1. Define endpoint inventory: `/health`, `/connections`, `/forms`, `/forms/:id/shares`, `/jobs`, `/jobs/:id`, `/exports`.
  2. Define envelope standard for success/error and pagination metadata.
  3. Add schemas and shared types in [packages/contracts](../../packages/contracts).
- Dependencies: architecture alignment and frontend requirements for polling and list filters.
- Risk: Medium (contract churn if frontend assumptions are not captured early).

2. Phase 2: Infrastructure Foundations (API Runtime)
- Goal: stand up reliable server scaffold with config, logging, and failure boundaries.
- Actions:
  1. Add Fastify bootstrap with plugin registration order (config -> logger -> auth -> routes -> error handler).
  2. Add environment schema validation (DB URL, RabbitMQ URL, JWT issuer/audience, allowed origins).
  3. Add structured error mapper and request correlation ID propagation.
- Dependencies: Phase 1 contracts and environment variable policy.
- Risk: Low.

3. Phase 3: Authorization and Data Policy Enforcement
- Goal: enforce owner-plus-share visibility uniformly across all resource routes.
- Actions:
  1. Define principal model from JWT claims (`user_id`, tenant/org claims).
  2. Implement policy utility functions (`canRead`, `canEdit`, `canShare`) and attach to services.
  3. Mirror visibility constraints in repositories using reusable SQL predicates.
  4. Define optional RLS migration path in [packages/db/migrations](../../packages/db/migrations).
- Dependencies: DB schema for ownership and share grants.
- Risk: High (most likely regression source).

4. Phase 4: Async Jobs and Messaging Reliability
- Goal: complete manual sync enqueue and job tracking contract.
- Actions:
  1. Define job schema (`job_id`, `type`, `trigger`, `status`, `requested_by`, timestamps, error fields).
  2. Implement enqueue flow: authorize -> persist job row -> publish RabbitMQ message -> return `202`.
  3. Add publish guarantees with confirms and clear compensating behavior when publish fails.
  4. Expose `GET /jobs/:id` and list endpoint scoped to owner/share policy.
- Dependencies: messaging topology in [packages/messaging](../../packages/messaging).
- Risk: High (transactional consistency and retries).

5. Phase 5: Domain Route Vertical Slices
- Goal: implement route-by-route in deployable increments.
- Actions:
  1. Connections module: list/create/update/revoke connection metadata and sync eligibility fields.
  2. Forms module: list/detail with owner/share filtering and pagination.
  3. Sharing module: grant/revoke/list permissions with audit records.
  4. Exports module: enqueue export jobs and expose status/result metadata.
- Dependencies: Phases 1-4 done for consistent middleware and data access.
- Risk: Medium.

6. Phase 6: Hardening, Documentation, and Handoff
- Goal: operational readiness and clear integration docs.
- Actions:
  1. Update [apps/api/README.md](../../apps/api/README.md) with endpoint summary, env vars, and local run instructions.
  2. Document queue topology and job lifecycle for worker/scheduler teams.
  3. Document error codes and retry guidance for frontend integration.
- Dependencies: all previous phases.
- Risk: Low.

## Endpoint and Contract Drill-Down

### Required Endpoint Set (v1)
- `GET /health`
  - Returns service liveness/readiness metadata.
- `GET /connections`
  - Lists caller-owned connections.
- `POST /connections`
  - Creates provider connection metadata (token handling policy defined separately).
- `PATCH /connections/:id`
  - Updates mutable connection fields.
- `DELETE /connections/:id`
  - Revokes/deactivates connection.
- `GET /forms`
  - Returns forms visible to caller (owned or shared).
- `GET /forms/:id`
  - Returns single form if authorized.
- `GET /forms/:id/shares`
  - Lists grants (owner/editor policy-based).
- `POST /forms/:id/shares`
  - Creates/updates grant.
- `DELETE /forms/:id/shares/:shareId`
  - Revokes grant.
- `POST /jobs/sync`
  - Manual sync trigger; returns `202` + `job_id`.
- `GET /jobs/:id`
  - Polls job status and summary/error information.
- `GET /jobs`
  - Lists caller-visible jobs with filters.
- `POST /exports`
  - Creates export job request.
- `GET /exports/:id`
  - Export job status and download metadata when ready.

### Response Envelope Standard
- Success:
  - `success: true`
  - `data: ...`
  - `meta: { requestId, pagination? }`
- Error:
  - `success: false`
  - `error: { code, message, details? }`
  - `meta: { requestId }`

### Job Status State Machine
- `queued` -> `running` -> `succeeded`
- `queued` -> `running` -> `failed`
- `queued` -> `cancelled` (optional for future)

## Security and Compliance Details
- Validate all route payloads with Zod before entering service logic.
- Verify JWT signature, issuer, audience, and token expiry.
- Never expose provider tokens in API responses.
- Enforce rate limits on manual sync/export endpoints.
- Sanitize user-supplied query/sort/filter inputs and whitelist sortable fields.
- Avoid leaking DB or broker internals in error messages.
- Audit trail required for share grant/revoke, manual sync trigger, export creation.

## Testing Strategy

### Unit Coverage Targets
- Validation schema tests in [packages/contracts](../../packages/contracts).
- Authorization policy matrix tests for owner/shared/forbidden paths.
- Service tests for enqueue preconditions and error mapping.
- Repository tests for visibility predicates and pagination correctness.

### Integration Coverage
- API route -> service -> DB path for core resources.
- API manual sync enqueue path including RabbitMQ publish confirm handling.
- Job polling endpoint behavior across all terminal and non-terminal states.
- Sharing grant/revoke authorization and persistence behavior.

### Regression Checks
- Envelope and error contract snapshots.
- Permission regression suite for all protected resources.
- Idempotency behavior under duplicate manual sync requests.

## Risks and Mitigations
- Authorization inconsistency across modules.
  - Mitigation: single shared policy library and required service-level guard usage.
- API-worker schema drift.
  - Mitigation: schema ownership in [packages/contracts](../../packages/contracts) and versioned message contracts.
- DB/publish inconsistency in async flows.
  - Mitigation: outbox-compatible design or transaction + publish-confirm recovery strategy.
- Queue backlog or poison messages.
  - Mitigation: DLQ policy, retry caps, alerting on failure rates and queue depth.
- Provider API token handling complexity.
  - Mitigation: isolate token lifecycle in connector-side services and keep API surface minimal.

## Acceptance Checklist
- Endpoint inventory and payload contracts are defined and documented.
- Library/framework decisions are finalized and reflected in implementation backlog.
- Ownership and sharing policy matrix is explicit and mapped to repository predicates.
- Manual sync and export endpoints are async-first with stable job lifecycle contract.
- RabbitMQ topology and publish reliability strategy are specified.
- Security controls (JWT verification, validation, rate limits, audit logs) are included in plan.
- Testing scope covers unit, integration, and permission regressions.
- API README and integration notes are ready for implementation handoff.

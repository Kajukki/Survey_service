# API Implementation Guide

## Purpose

This guide captures the current implementation state for the Survey Service API stack and provides a concrete development path for the next phases.

It is intentionally split into:

- What is implemented now.
- What is in progress.
- What must not be claimed until complete.
- What to build next, in execution order.

## Current State Snapshot

### Implemented and Active

1. Core API runtime
- Fastify server bootstrap, config validation, logging, metrics, and error envelope handling.
- Route registration under `/api/v1` plus `/health` and `/metrics`.

2. Messaging and job pipeline
- RabbitMQ topology assertion and publish via confirm channel in API.
- Persisted sync jobs in PostgreSQL (`jobs` table).
- Worker consumption path updates lifecycle state in DB:
  - `queued` -> `running` -> `succeeded` or `failed`.
- Worker export lifecycle polling updates `export_jobs` from `queued` to `ready` with generated `download_url`.

3. Local authentication flow
- DB tables for users and refresh tokens.
- Auth endpoints:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
- Frontend login/register view and session persistence + refresh retry behavior.

4. Shared contracts
- Authentication schemas and types added to `packages/contracts`.
- Error envelope shape aligned between API and web adapter.

5. Request principal extraction
- Bearer access token verification is wired into API request handling.
- Protected jobs/connections/forms/sharing routes now read principal from request context.

6. Auth mode selection baseline
- API runtime supports `AUTH_MODE=local|oidc`.
- `local` mode verifies HS256 tokens using `AUTH_JWT_SECRET`.
- `oidc` mode verifies tokens against remote JWKS via `OIDC_JWKS_URI`.

### Partially Implemented

1. Export workflow hardening
- Export enqueue/list/detail/download and worker lifecycle transitions are implemented.
- Durable artifact storage + signed URL delivery is still pending (current worker generates deterministic placeholder download URLs).

2. Authorization enforcement
- Policy helpers exist, and protected routes now require a request principal.
- Jobs list/detail reads are now scoped by authenticated requester.
- Sharing routes now enforce owner-scoped access checks (404 on inaccessible forms).
- Connections delete route now enforces owner-scoped access checks.
- Forms sync route now enforces owner-scoped access checks.
- Owner/share policy parity has been implemented for DB-backed connections/forms/sharing/exports/dashboard reads.

3. Google provider auth API surface
- `POST /api/v1/providers/google/auth/start` and `POST /api/v1/providers/google/auth/callback` are now implemented.
- Provider auth state and provider connection metadata now have DB-backed persistence groundwork.

### Planned (Not Yet Implemented)

1. Enterprise IdP auth mode
- OIDC/JWKS verification as active runtime path.
- End-to-end principal mapping from external identity provider.

2. Analytics delivery tuning
- Dashboard health/activity endpoint is implemented; detailed analytics are served by forms workspace endpoints and continue to be tuned for UX/data quality.

## Mandatory Accuracy Gates

Do not claim these as complete until implemented and verified:

1. Full multi-user authorization
- All protected routes must use extracted principal and enforce owner/share checks.

2. Production auth readiness
- Auth mode, secret handling, token policy, and error behavior must be documented and tested for production profile.

3. End-to-end domain persistence
- Connections/forms/sharing must be DB-backed (not mock-backed) before claiming contract-complete API.

## Execution Plan

### Track A: Security and Access Correctness (Highest Priority)

Goal: remove hardcoded request-user assumptions and enforce policy uniformly.

1. Add request principal extraction middleware/plugin.
2. Pass principal through service/repository boundaries where ownership matters.
3. Apply policy checks in connections/forms/sharing/jobs paths.
4. Add integration tests that prove cross-tenant/cross-user access is blocked.

Exit criteria:
- No protected route relies on hardcoded user IDs.
- Permission regression suite passes.

### Track B: Replace Mock Domain Paths (Completed Runtime Slice)

Goal: keep runtime behavior DB-backed and remove in-memory fallback branches from domain routes.

Completed:
1. Removed runtime fallback branches from connections/forms/sharing/exports route modules.
2. Removed mock fallback logic from jobs sync-target resolution service.
3. Updated route tests to exercise DB-backed stubs only.

Exit criteria:
- Runtime routes are persistence-backed.
- Contract tests pass for payload and envelope stability.

### Track C: Auth Model Consolidation

Goal: align runtime auth model with architecture decisions and docs.

1. Decide short-term auth mode for production-adjacent environments:
- Local credentials only (temporary), or
- External IdP integration now.
2. Document chosen mode in architecture and API docs.
3. Implement missing runtime hooks for the selected mode.

Exit criteria:
- One declared source-of-truth auth mode per environment.
- No contradictory auth documentation remains.

### Track D: Export and Analytics Delivery

Goal: complete functional roadmap beyond sync jobs.

1. Replace placeholder export URL generation with durable artifact storage and signed URL delivery.
2. Implement analytics read endpoints needed by dashboard.
3. Add end-to-end tests for one export flow and one analytics query.

Exit criteria:
- Web feature teams can integrate against stable, tested endpoints.

## Test Matrix

### Required Tests by Area

1. Auth
- Register/login/refresh success and failure cases.
- Refresh token rotation and revocation behavior.

2. Authorization
- Owner allowed, non-owner denied, share-permitted behavior (where applicable).

3. Jobs
- Enqueue persists and publishes.
- Worker updates states and handles invalid payload via nack/DLQ path.

4. Domain modules
- Connections/forms/sharing route integration with DB-backed repositories.

5. Contract
- Envelope and field compatibility tests used by web adapters.

## Documentation Update Protocol

For every completed implementation slice, update the following in the same PR:

1. `docs/API-contract.md`
- Mark endpoint status (`Implemented`, `Partial`, `Planned`).

2. `apps/api/README.md`
- Update endpoint maturity and security checklist.

3. `docs/plans/API-design-plan.md` and `docs/plans/API-implementation-plan.md`
- Move completed work from backlog to completed section.

4. `README.md`
- Keep high-level status accurate and concise.

## Quick Verification Commands

```bash
npm run test
npm --workspace @survey-service/api run test
npm --workspace @survey-service/worker run test
npm --workspace @survey-service/web run test
```

For local integration verification, see `LOCAL_DEVELOPMENT.md`.


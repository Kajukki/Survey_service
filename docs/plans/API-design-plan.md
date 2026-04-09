# Implementation Plan: API Design and Delivery (Survey Service)

## Overview

This plan defines the target API architecture while explicitly tracking the current branch implementation state.

Design objective:

- A stable, secure API that enforces ownership/sharing, persists state, and delegates long-running work to RabbitMQ workers.

## Current vs Target

### Current Runtime (Implemented)

1. API platform
- Fastify runtime with config validation, logging, metrics, and error envelope.

2. Auth path
- Local credential auth (`register/login/refresh`) with DB-backed users and refresh tokens.

3. Async jobs
- DB-backed sync job persistence.
- RabbitMQ publish with confirm channel.
- Worker lifecycle updates persisted in DB.

4. Shared contracts
- Auth/session schemas and types in shared contract package.

### Current Runtime (Partial)

1. Export workflow hardening
- API and worker lifecycle are implemented, but durable artifact storage and signed URLs are still pending.

2. Auth strategy consolidation
- Runtime supports both `AUTH_MODE=local` and `AUTH_MODE=oidc` token verification.
- Environment policy and rollout hardening remain in progress.

### Target Architecture

1. Principal-first route access enforcement across all protected resources.
2. Full DB-backed implementations for connections/forms/sharing.
3. Export and analytics endpoints aligned with frontend feature needs.
4. Environment-specific auth strategy documented and consistently implemented.

## Design Principles

1. Thin HTTP orchestration layer
- Validate input, authorize, persist, publish, shape response.

2. Async by default for heavy operations
- Return `202 Accepted` with job metadata.

3. Contract-first consistency
- Shared DTO schemas in `packages/contracts` for API and web.

4. Explicit route maturity
- Every endpoint is tagged as `Implemented`, `Partial`, or `Planned` in docs.

## Endpoint Strategy

### Stable in Current Runtime

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/jobs/sync`
- `GET /api/v1/jobs`
- `GET /api/v1/jobs/:id`

### Transitional (Route Surface Exists)

- `GET /api/v1/connections`
- `POST /api/v1/connections`
- `DELETE /api/v1/connections/:id`
- `GET /api/v1/forms`
- `GET /api/v1/forms/:id`
- `POST /api/v1/forms/:id/sync`
- `GET /api/v1/forms/:id/shares`
- `POST /api/v1/forms/:id/shares`
- `DELETE /api/v1/forms/:id/shares/:share_id`

### Planned

- Export artifact storage and signed URL delivery hardening path.
- Analytics/dashboard endpoints.

## Phased Delivery

### Phase 1: Access Enforcement Baseline

Goal: make authorization behavior trustworthy.

1. Introduce principal extraction for protected routes.
2. Remove hardcoded request-user defaults.
3. Add policy checks for connections/forms/sharing/jobs.
4. Add integration tests for access isolation.

### Phase 2: Domain Persistence Completion

Goal: replace mocks with repositories.

1. Implement repository/service layers for connections/forms/sharing.
2. Preserve envelope shape and field compatibility.
3. Add route integration tests.

### Phase 3: Auth Strategy Consolidation

Goal: eliminate documentation and runtime drift.

1. Decide runtime auth mode per environment.
2. Document decision in architecture and API docs.
3. Implement missing runtime components for chosen mode.

### Phase 4: Export and Analytics Delivery

Goal: support remaining frontend critical paths.

1. Export enqueue/status/download completion.
2. Dashboard analytics read endpoints.
3. Contract tests for frontend compatibility.

## Risks and Mitigations

1. Route security drift
- Mitigation: mandatory policy test suite for protected endpoints.

2. Contract drift between API and web
- Mitigation: shared schema usage and adapter contract tests.

3. Transitional auth ambiguity
- Mitigation: explicit environment auth matrix in docs.

## Acceptance Criteria

1. No protected route uses hardcoded user IDs.
2. Connections/forms/sharing are DB-backed.
3. Auth model is clearly documented per environment and reflected in runtime.
4. API contract document tags endpoint maturity accurately.
5. Integration tests cover auth, authorization, and job lifecycle critical paths.

# Implementation Plan: API Delivery Backlog

## Purpose

This document is the execution backlog for API delivery, based on the current implementation state in this branch.

## Delivery Status Board

### Completed

1. Core runtime
- Fastify bootstrap, config validation, logging, metrics, error envelope.

2. Messaging and jobs
- RabbitMQ topology assertion and publish confirms.
- `jobs` table persistence and job route support.
- Worker lifecycle updates from queue messages.

3. Local auth
- `register`, `login`, `refresh` endpoints.
- Users and refresh-token storage.
- Shared auth schemas.

4. Principal extraction baseline
- Request principal extraction from bearer access tokens is wired in API runtime.
- Protected jobs/connections/forms/sharing routes now consume principal from request context.

5. Domain persistence parity for core modules
- Connections/forms/sharing routes are DB-backed in runtime with owner/share-scoped access checks.

6. Export workflow lifecycle baseline
- Export enqueue/list/detail/download API surface is implemented with owner-scoped reads.
- Worker now processes queued export jobs and transitions to `ready` with generated `download_url`.

### In Progress

1. Export workflow production hardening
- Replace placeholder download URL generation with durable artifact storage and signed URL delivery.

2. Authorization parity
- Principal extraction is active on protected routes.
- Jobs read paths now enforce requester-scoped lookup.
- Sharing routes now enforce owner-scoped access checks for form share access.
- Connections delete path now enforces owner-scoped lookup.
- Forms sync path now enforces owner-scoped lookup.
- Owner/share policy matrix parity is not yet universal across mock-backed domain paths.

3. Google connector boundary setup
- Provider connector DTOs now exist in `packages/contracts`.
- Initial `GoogleFormsConnector` boundary and unit tests now exist in `packages/connectors`.
- Google provider auth start/callback routes are now wired in `apps/api` with PKCE validation and connector exchange flow.
- Provider auth states and provider connections now have DB schema + repository groundwork for credential lifecycle persistence.

### Not Started

1. Environment-ready enterprise IdP auth mode.

## Priority Backlog

## P0: Security and Correctness

### Item 1: Principal extraction and propagation

Scope:

- Add principal extraction middleware/plugin.
- Ensure protected routes consume principal from request context.

Definition of done:

- No protected route relies on hardcoded user IDs.
- Integration tests cover unauthenticated and unauthorized cases.

### Item 2: Route authorization enforcement

Scope:

- Apply owner/share checks in connections/forms/sharing/jobs read paths.

Definition of done:

- Policy matrix tests pass for owner/shared/forbidden scenarios.
- Contract responses use expected 401/403/404 semantics.

## P1: Replace Mock-backed Domain Paths

### Item 3: Connections persistence

Scope:

- Repository/service implementation.
- Route handlers switched from mock data to persistence.

Definition of done:

- CRUD route tests pass against DB-backed repository.

### Item 4: Forms persistence

Scope:

- Forms list/detail backed by DB and visibility predicates.

Definition of done:

- Pagination and ownership/share checks covered by tests.

### Item 5: Sharing persistence

Scope:

- Grants list/create/delete backed by DB.

Definition of done:

- Permission checks and persistence tests pass.

## P2: Google Forms Provider Integration

### Item 6: Google OAuth 2.0 PKCE connector boundary

Scope:

- Define provider-neutral connector interfaces.
- Implement Google client wrappers in `packages/connectors/google`.
- Implement Authorization Code + PKCE flow for per-user Google account linking.
- Store Google refresh tokens per user connection.

Definition of done:

- Worker can call Google through a stable connector interface.
- Auth and credential handling strategy is documented and tested.
- Users can link their own Google account via the connector boundary.

### Item 7: Google sync pipeline

Scope:

- Provider sync cursors.
- Fetch/normalize/persist workflow in the worker.
- Connection metadata and manual sync trigger wiring.

Definition of done:

- A Google sync job completes end-to-end and persists normalized results.

## P3: Product Completeness

### Item 8: Export workflow

Scope:

- Export enqueue/status/download contract and implementation.

Definition of done:

- Export route integration tests pass.

### Item 9: Analytics reads

Scope:

- Dashboard-oriented aggregate read endpoints.

Definition of done:

- Contract tests pass for dashboard payload shape.

## P4: Auth Strategy Consolidation

### Item 10: Environment auth matrix

Scope:

- Document and implement final auth mode per environment.

Definition of done:

- No conflicting auth statements across architecture, plans, API README, and contract docs.

## Test Plan by Milestone

### Milestone A (P0)

Required:

1. Route auth tests for missing/invalid principal.
2. Policy matrix tests for access decisions.
3. Regression tests for current auth endpoints.

### Milestone B (P1)

Required:

1. Connections/forms/sharing route integration tests with DB.
2. Contract envelope compatibility tests.

### Milestone C (P2)

Required:

1. Google connector unit tests for request shaping and error mapping.
2. Google auth/token lifecycle tests.
3. Google worker integration test from queue message to terminal job state.

### Milestone D (P3/P4)

Required:

1. Export end-to-end test (enqueue to terminal state).
2. Analytics read contract test.
3. Auth mode selection tests/config checks per environment.

## Documentation Sync Rules

Every PR closing one backlog item must update:

1. `docs/API-contract.md` endpoint status tags.
2. `apps/api/README.md` endpoint maturity table.
3. `IMPLEMENTATION_GUIDE.md` status snapshot.
4. `docs/plans/google-forms-integration-plan.md` when connector behavior changes.

## Suggested Execution Order

1. P0 Item 1
2. P0 Item 2
3. P1 Item 3
4. P1 Item 4
5. P1 Item 5
6. P2 Item 6
7. P2 Item 7
8. P3 Item 8
9. P3 Item 9
10. P4 Item 10
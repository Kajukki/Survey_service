# ADR-003: API Boundary Refactor Aligned With Worker Phases 1-5

## Status
In progress

## Date
2026-04-09

## Related ADRs
- ADR-001: [docs/adr/ADR-001-api-worker-boundaries.md](docs/adr/ADR-001-api-worker-boundaries.md)
- ADR-002: [docs/adr/ADR-002-worker-phases-3-4-5-execution.md](docs/adr/ADR-002-worker-phases-3-4-5-execution.md)

## Context
Worker refactor phases 1-5 established clear runtime boundaries:
- SQL isolated to worker repository modules.
- Sync orchestration isolated to a dedicated processor and provider adapter.
- Message handling isolated to a dedicated handler.
- Runtime role separation introduced with `WORKER_ROLE=all|sync|export`.

API still has boundary and maintainability issues that now conflict with this worker state:
- Route modules hold mixed concerns (HTTP contract, authorization checks, query composition, analytics shaping, and sync command orchestration).
- `forms` route module is very large and mixes read models with business logic.
- Sync enqueue paths are duplicated (`jobs` and `forms` routes) with shared behavior spread across modules.
- Job create and RabbitMQ publish are separate operations without transactional reliability.
- API still computes fallback analytics in route logic, while worker is now the system-of-record writer for analytics snapshots.

This mismatch increases drift risk, weakens command-query boundaries, and slows future changes.

## Decision
Adopt an API refactor that mirrors worker boundary style and enforces API as a thin command/query boundary.

1. Route boundary
- Routes only perform request parsing, principal extraction, and response mapping.
- No direct query building or analytics computation in route files.

2. Application service boundary
- Command services own orchestration (for example sync enqueue, export enqueue, share grants).
- Query services own read aggregation for API response models.

3. Repository boundary
- DB access is isolated to repository modules per bounded context.
- No SQL or Kysely query building in route files.

4. Messaging boundary
- Messaging publish is invoked by command services through a dedicated port.
- Publish reliability is handled with transactional outbox (Phase 4) rather than best-effort publish-after-insert.

5. Worker alignment boundary
- Worker remains the single writer of analytics snapshots.
- API reads persisted analytics snapshots and metadata without rebuilding equivalent analytics in route code.
- API does not assume all worker roles are active; it returns asynchronous job semantics consistently.

## Target API Structure

```text
apps/api/src/
  index.ts                         # bootstrap and shutdown
  server/
    create-server.ts               # plugin and route registration only
    config.ts
    principal.ts
    errors.ts

  infra/
    db.ts
    rabbitmq.ts
    metrics.ts
    outbox-publisher.ts            # added in phase 4

  modules/
    jobs/
      jobs.route.ts
      jobs.command-service.ts
      jobs.query-service.ts
      jobs.repository.ts
      jobs.messaging-port.ts

    forms/
      forms.route.ts
      forms.query-service.ts
      forms.repository.ts
      forms-analytics.query-service.ts

    exports/
      exports.route.ts
      exports.command-service.ts
      exports.query-service.ts
      exports.repository.ts

    dashboard/
      dashboard.route.ts
      dashboard.query-service.ts
      dashboard.repository.ts

    connections/
      connections.route.ts
      connections.command-service.ts
      connections.query-service.ts
      connections.repository.ts
```

## Implementation Status (2026-04-29)

### Implemented
- Transactional outbox for sync jobs is in place (jobs insert plus outbox publisher loop).
- Unified sync command service is used by both sync entry points.
- Worker persists analytics snapshots during sync processing.

### Partially Implemented
- Analytics reads: /forms/:id/analytics reads snapshots but other analytics endpoints compute from responses and fall back to live calculations.
- Route extraction: jobs has repository/command service, but other modules still query DB directly from routes.

### Not Implemented
- Repositories and query services for forms, connections, exports, and dashboard.
- Jobs query service and messaging port structure from the target layout.
- Runbook updates for worker role scenarios.

## Remaining Implementation Plan (2026-04-29)

### Phase 1: Route and Service Extraction (No Behavior Change)
1. Create repositories and query services for forms, connections, exports, and dashboard; migrate all SQL from routes.
2. Move resolveAccessibleForm, form response/structure loaders, and mapping helpers into forms.repository and forms.query-service.
3. Introduce jobs.query-service for list/get and remove the duplicate enqueue path in jobs.service.
4. Keep route payloads stable and update unit/integration tests to target services.

### Phase 2: Analytics Read Alignment
1. Use analytics snapshots for overview/questions/segments queries; only fall back to response-based computation when snapshots are missing.
2. Make fallback explicit with a warning log and metric, and document deprecation timing.
3. Add tests covering snapshot-based analytics and fallback behavior.

### Phase 3: Unified Sync Command Boundary Hardening
1. Add contract parity tests for POST /jobs/sync and POST /forms/:id/sync.
2. Centralize authorization error mapping in the command service to ensure consistent responses.

### Phase 5: Observability and Runbooks
1. Add command/query correlation IDs to structured logs and outbox events.
2. Document API behavior when WORKER_ROLE is sync, export, or all in runbooks.
3. Add dashboard/alerts for enqueue latency and outbox lag.

## Original Implementation Plan (2026-04-09)

### Phase 1: Route and Service Extraction (No Behavior Change)
1. Extract non-HTTP logic from `forms.route` into query services and repositories.
2. Extract sync enqueue orchestration from routes into `jobs.command-service`.
3. Keep existing endpoint contracts and payload shapes unchanged.

Exit Criteria:
- Route files are thin.
- Existing API tests pass with no contract changes.

### Phase 2: Query Model Consolidation and Analytics Read Boundary
1. Move analytics and response shaping logic from `forms.route` into `forms-analytics.query-service`.
2. Treat worker snapshots as primary analytics source for API reads.
3. Keep fallback paths explicit and temporary, with deprecation notes.

Exit Criteria:
- No analytics math utilities remain in route files.
- API analytics responses are built from query services only.

### Phase 3: Unified Sync Command Boundary
1. Introduce single sync command path used by both `POST /jobs/sync` and `POST /forms/:id/sync`.
2. Enforce ownership and authorization checks before job creation.
3. Ensure `formId` semantics are explicit and contract-verified end-to-end.

Exit Criteria:
- One command service owns sync enqueue behavior.
- Authorization checks are centralized and test-covered.

### Phase 4: Reliable Publish With Transactional Outbox
1. Add outbox table and publisher loop.
2. Persist job row and outbox event in one transaction.
3. Move RabbitMQ publish from inline request flow to outbox dispatch.

Exit Criteria:
- No orphaned queued jobs from publish failures.
- Replayable outbox events and operational visibility in logs/metrics.

### Phase 5: Hardening, Observability, and API/Worker Operational Alignment
1. Add structured command/query logs with request and job correlation IDs.
2. Add metrics for enqueue latency, outbox lag, and publish failures.
3. Update runbooks for worker role scenarios (`sync`, `export`, `all`) and expected API behavior.

Exit Criteria:
- Operational dashboards and alerts cover enqueue-to-process path.
- API remains stable when only selected worker roles are active.

## Testing and Quality Gates
- Per phase required checks:
  - `npm --workspace @survey-service/api run typecheck`
  - `npm --workspace @survey-service/api run test`
- Additional mandatory coverage:
  - Contract tests for `jobs/sync` and `forms/:id/sync` parity.
  - Authorization matrix tests for owner/shared/forbidden scenarios.
  - Outbox integration tests (phase 4) for publish retry and idempotency.

## Risks and Mitigations
- Risk: Behavioral drift while extracting route logic.
  - Mitigation: no contract change in phases 1-2 and snapshot-based regression tests.
- Risk: Duplicate command paths persist.
  - Mitigation: make unified command service a hard phase 3 gate.
- Risk: Outbox adds operational complexity.
  - Mitigation: start with minimal schema, retry backoff, and explicit monitoring.

## Rollout Strategy
- One feature branch and one PR per phase.
- Atomic commits inside each phase branch.
- Manual review gate between phases.
- No message schema breaking changes without coordinated worker compatibility update.

## Acceptance Checklist
- [ ] API route files are thin and HTTP-focused.
- [ ] Business orchestration lives in command/query services.
- [ ] Repository boundary enforced for database access.
- [ ] Unified sync command service used by both sync entry endpoints.
- [ ] Transactional outbox is implemented and tested.
- [ ] Analytics reads align with worker snapshot ownership.
- [ ] Per-phase checks and tests pass before merge.




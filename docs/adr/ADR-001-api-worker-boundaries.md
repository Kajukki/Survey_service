# ADR-001: Enforce Clear API-Worker Boundaries and Modular Worker Architecture

## Status
Proposed

## Date
2026-04-09

## Context
The current API and Worker implementation has grown hard to maintain and does not enforce clear architectural boundaries.

Observed issues:
- Worker logic is concentrated in a single large entry file that mixes bootstrap, config, messaging topology, queue handling, provider orchestration, crypto, SQL persistence, analytics computation, and export polling.
- API and Worker responsibilities blur in practice, with duplicate analytics and response-shaping logic implemented in multiple places.
- Message intent is not fully reflected by behavior in all paths, which increases contract ambiguity.
- Operational scaling concerns are coupled because sync and export concerns run in the same runtime flow.

This conflicts with the documented architecture intent:
- API should validate, authorize, enqueue, and return quickly.
- Workers should consume messages and execute background processing in bounded modules.
- Shared contracts should remain single-sourced and behaviorally aligned.

## Decision
Adopt a boundary-first refactor with these core rules:

1. API boundary
- API owns request validation, authentication, authorization, and command enqueue.
- API does not run sync or analytics processing inline.
- API uses shared messaging contracts only for publish payload shape, not worker internals.

2. Worker boundary
- Worker owns background processing, provider integration, persistence orchestration, and analytics snapshot generation.
- Worker entrypoint must only bootstrap dependencies, start consumers, and handle shutdown.
- Worker business logic must be decomposed into focused modules.

3. Shared contract boundary
- Message schemas remain in the shared messaging package.
- Any optional message field must be either fully honored in worker behavior or removed from the contract.

4. Runtime separation boundary
- Sync processing and export processing are separable runtime roles, even if initially deployed from one codebase.

## Target Worker Structure
The worker codebase will be organized as follows:

```text
apps/worker/src/
  index.ts                  # main only: bootstrap, wiring, shutdown
  config.ts                 # configSchema, loadConfig, loadEnvironmentFiles
  state.ts                  # WorkerState, getWorkerState

  crypto/
    credentials.ts          # encrypt, decrypt, isTokenExpiringSoon

  db/
    jobs.ts                 # markJobRunning / markJobSucceeded / markJobFailed
    connections.ts          # loadProviderConnection and credential metadata reads
    forms.ts                # upsertForm, upsertResponse, upsertAnalytics

  analytics/
    stats.ts                # computeNumericStats (pure)
    schema.ts               # buildPersistedFormSchema, buildQuestionLookup (pure)
    snapshot.ts             # buildAnalyticsSnapshot (pure)

  sync/
    processor.ts            # processSyncJob orchestration only
    http-client.ts          # createFetchHttpClient
    providers/
      google.ts             # provider-specific sync adapter

  export/
    processor.ts            # processQueuedExportJobs, buildExportDownloadUrl

  messaging/
    topology.ts             # assertTopology
    handler.ts              # message parse, invoke processor, ack or nack

  types/
    domain.ts               # worker-internal domain types
    errors.ts               # typed processing errors and serialization contracts
```

## Actionable Plan

### Phase 1: Safe Extraction (No Behavior Change)
1. Create module skeleton and move config and state first.
2. Move messaging topology assertion into messaging/topology.ts.
3. Move crypto helpers into crypto/credentials.ts.
4. Keep index.ts as composition root and preserve startup behavior.

Deliverables:
- New files compile and worker behavior remains unchanged.
- index.ts size reduced and focused on wiring.

### Phase 2: Pure Logic Isolation
1. Move analytics pure functions into analytics/stats.ts, analytics/schema.ts, analytics/snapshot.ts.
2. Add focused unit tests for pure modules.
3. Remove duplicated analytics logic from API routes over time by consuming persisted analytics snapshots.

Deliverables:
- Pure modules have deterministic tests.
- Worker remains the single writer for analytics snapshots.

### Phase 3: Repository Boundaries
1. Extract SQL operations into db/jobs.ts, db/connections.ts, db/forms.ts.
2. Define repository interfaces used by sync and export processors.
3. Keep transactions explicit at processor boundary.

Deliverables:
- No raw SQL in messaging handlers or bootstrap.
- DB behavior covered by integration tests.

### Phase 4: Processor and Provider Separation
1. Keep sync/processor.ts as thin orchestration.
2. Move Google-specific API behavior to sync/providers/google.ts.
3. Ensure message fields such as form scope are behaviorally enforced or removed from schema.

Deliverables:
- Provider-specific logic is isolated.
- Contract behavior is unambiguous and test-covered.

### Phase 5: Runtime Role Separation
1. Introduce runtime role selection (for example SYNC or EXPORT).
2. Run sync and export loops independently.
3. Scale roles independently in deployment configuration.

Deliverables:
- Independent scaling and operational tuning.
- Clear ownership of failure domains.

## Acceptance Criteria
- Worker entrypoint contains only bootstrap and lifecycle logic.
- No SQL exists outside worker db modules.
- No analytics computation exists in API route files for persisted datasets.
- Shared message contract fields map to implemented behavior.
- Sync and export flows can run as separate runtime roles.
- Existing end-to-end job lifecycle tests pass, and new module-level tests are added.

## Consequences

Positive:
- Better maintainability and onboarding due to cohesive modules.
- Lower regression risk with smaller change surfaces.
- Cleaner API-Worker ownership boundaries.
- Easier future provider additions.

Negative:
- Short-term refactor overhead and temporary duplicate code during migration.
- Additional interface and file management complexity.

## Risks and Mitigations
- Risk: Behavioral drift during extraction.
  - Mitigation: Phase-by-phase refactor with no behavior change in Phases 1-3 and regression tests after each slice.
- Risk: Contract mismatch remains hidden.
  - Mitigation: Add contract tests that validate publish payloads against worker-consumed behavior.
- Risk: Deployment complexity increases with role split.
  - Mitigation: Start with one image and runtime role flag before moving to separate deployments.

## Rollback Strategy
- Keep refactor in small PR slices.
- If a slice fails in staging, revert only that slice and keep previous modules intact.
- Do not change message schema semantics without matching worker behavior in the same release.

## Follow-Up Work Items
1. Create implementation tickets for each phase with owner and estimate.
2. Add a migration checklist to worker README after Phase 1.
3. Add architecture verification checks in code review template for boundary violations.
4. Draft a second ADR if transactional outbox is introduced for API job publish reliability.

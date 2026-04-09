# ADR-002: Execution Decisions for Worker Refactor Phases 3, 4, and 5

## Status
Proposed

## Date
2026-04-09

## Related ADRs
- ADR-001: [docs/adr/ADR-001-api-worker-boundaries.md](docs/adr/ADR-001-api-worker-boundaries.md)

## Context
ADR-001 defined the target architecture and the phased roadmap for modular worker boundaries.

Phases 1 and 2 focused on safe extraction and pure analytics isolation. The next stages carry higher operational risk because they move SQL behavior, queue message handling, and runtime process composition.

To reduce regressions, phases 3 through 5 need explicit decisions on:
- where transaction boundaries live,
- how sync orchestration is split from provider logic,
- how runtime roles are introduced without changing message contracts,
- and how rollout safety is enforced with measurable exit criteria.

## Decision
Adopt the following execution decisions for Phases 3-5.

1. Repository boundary decision (Phase 3)
- All SQL must be moved from worker entry and messaging handler flows into repository modules under `apps/worker/src/db`.
- Repository modules are organized by ownership:
  - `db/jobs.ts` for job state transitions.
  - `db/connections.ts` for provider connection read and credential metadata updates.
  - `db/forms.ts` for forms, responses, and analytics snapshot persistence.
  - `db/exports.ts` for export queue polling and status updates.
- Transaction ownership lives in processors, not in messaging handlers.

2. Orchestration and provider boundary decision (Phase 4)
- `sync/processor.ts` is the only sync orchestrator and must depend on interfaces, not direct SQL snippets.
- Provider-specific behavior is isolated in `sync/providers/google.ts`.
- Message handling logic in `messaging/handler.ts` is limited to:
  - parse and validate message,
  - invoke processor,
  - update job terminal state through repositories,
  - ack or nack.
- Any message field currently accepted by schema must be enforced by behavior or explicitly deprecated in a follow-up contract ADR.

3. Runtime role separation decision (Phase 5)
- Introduce runtime role selection via environment variable (default: `all` for backward compatibility).
  - `WORKER_ROLE=sync`
  - `WORKER_ROLE=export`
  - `WORKER_ROLE=all`
- Keep one container image and branch runtime composition in `index.ts`.
- Scale behavior by deployment role without changing queue topology.

4. Backward compatibility decision
- No queue naming, exchange naming, or payload schema changes in phases 3-5.
- Existing operational behavior must remain compatible during migration.

## Scope

### In Scope
- Worker internals under `apps/worker/src`.
- Worker tests under `apps/worker/src/**/*.test.ts`.
- Worker documentation updates tied to runtime role operation.

### Out of Scope
- API transactional outbox redesign.
- RabbitMQ topology redesign.
- Connector feature expansion beyond current Google behavior.

## Implementation Plan

### Phase 3: Repository Boundaries

#### Step 3.1: Introduce repository modules and interfaces
- Create `db/jobs.ts`, `db/connections.ts`, `db/forms.ts`, `db/exports.ts`.
- Define explicit interface contracts consumed by processors.
- Risk: Low.

#### Step 3.2: Move SQL from `index.ts` to repositories
- Relocate all job update queries, provider connection lookup and token persistence, form and response upserts, analytics snapshot upsert, and export polling SQL.
- Keep SQL text unchanged when first moved.
- Risk: Medium.

#### Step 3.3: Add repository-focused tests
- Add integration-style tests for repositories with mocked `pg` client boundaries.
- Cover happy path and failure path for each repository function.
- Risk: Medium.

#### Step 3.4: Keep processors as transaction owners
- `sync/processor.ts` and `export/processor.ts` control transaction begin/commit/rollback decisions.
- Messaging handler remains transaction-agnostic.
- Risk: Medium.

Exit Criteria for Phase 3:
- No SQL remains in `index.ts` or message handler modules.
- All SQL paths are invoked through repository abstractions.
- Worker typecheck and tests pass.

### Phase 4: Processor and Provider Separation

#### Step 4.1: Build `sync/processor.ts` as thin orchestrator
- Move sync orchestration logic out of entrypoint.
- Inject dependencies: repositories, provider adapter, logger, config.
- Risk: Medium.

#### Step 4.2: Build `sync/providers/google.ts`
- Move Google connector construction, refresh handling, and provider fetch calls into provider adapter.
- Keep response normalization contract unchanged.
- Risk: Medium.

#### Step 4.3: Build `messaging/handler.ts`
- Move parse/validate/ack/nack and error serialization to handler module.
- Ensure handler has no SQL and no provider-specific branching.
- Risk: Medium.

#### Step 4.4: Add contract and orchestration tests
- Test invalid payload dead-letter behavior.
- Test sync failure and success path state transitions.
- Test provider adapter error propagation with stage context.
- Risk: Medium.

Exit Criteria for Phase 4:
- Provider-specific code exists only in `sync/providers/google.ts`.
- Message handling exists only in `messaging/handler.ts` and has no business logic beyond flow control.
- `index.ts` only wires dependencies and lifecycle.

### Phase 5: Runtime Role Separation

#### Step 5.1: Introduce runtime role config
- Add validated `WORKER_ROLE` config with default `all`.
- Wire role selection in worker bootstrap.
- Risk: Low.

#### Step 5.2: Split startup loops by role
- `sync` role starts queue consumer only.
- `export` role starts export lifecycle polling only.
- `all` starts both for compatibility.
- Risk: Medium.

#### Step 5.3: Add role-mode tests and operational docs
- Add startup behavior tests for each role mode.
- Update worker README with deployment examples and scaling notes.
- Risk: Low.

Exit Criteria for Phase 5:
- Runtime role selection works deterministically for `sync`, `export`, and `all`.
- Existing deployments continue working with default role.
- Operational docs updated with role-specific deployment guidance.

## Testing and Quality Gates
- Mandatory per-phase gates:
  - `npm --workspace @survey-service/worker run typecheck`
  - `npm --workspace @survey-service/worker run test`
- Additional gates:
  - Message handler tests must validate ack/nack behavior.
  - Repository tests must cover update and rollback path behavior.
  - Processor tests must validate stage-aware error propagation.

## Rollout Strategy
- Deliver one phase per feature branch with atomic commits.
- Open one PR per phase and require manual review before the next phase starts.
- Keep rollback surface small by avoiding cross-phase PR scope.

## Risks and Mitigations
- Risk: Behavioral drift while moving SQL.
  - Mitigation: move SQL verbatim first, then optimize in follow-up PRs.
- Risk: Hidden coupling between handler and processor.
  - Mitigation: enforce interface-only dependencies and tests at module seams.
- Risk: Runtime role misconfiguration.
  - Mitigation: strict config validation plus safe default `all`.

## Acceptance Checklist
- [ ] Phase 3 complete: SQL isolated to repository modules.
- [ ] Phase 4 complete: sync orchestration and provider adapter boundaries enforced.
- [ ] Phase 5 complete: role-based runtime composition implemented with backward compatibility.
- [ ] Each phase delivered via atomic commits and separate pull request.
- [ ] Worker typecheck and tests pass for every phase PR.

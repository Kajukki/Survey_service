# Implementation Plan: ADR-001 Phase 1 and Phase 2

## Overview
- This plan executes ADR-001 for the first two phases only:
- Phase 1: safe extraction and modularization with no behavior change.
- Phase 2: pure analytics logic isolation and test hardening.
- Expected impact: improved maintainability, smaller change surface, and safer future extraction of repositories and processors.

## Assumptions and Constraints
- Assumptions:
- The Worker runtime behavior must remain equivalent during Phase 1.
- Existing queue contracts in [packages/messaging/src/index.ts](packages/messaging/src/index.ts) remain unchanged in Phase 1 and Phase 2.
- Existing provider logic continues to run from current Worker flow while extraction is in progress.
- Constraints:
- No production behavior rewrites in these phases.
- No schema changes to database tables in these phases.
- Refactor should be delivered in small PR slices to reduce rollback scope.
- Keep API behavior stable while preparing later removal of duplicated analytics logic.

## Affected Areas
- Primary Worker entry and current monolith:
- [apps/worker/src/index.ts](apps/worker/src/index.ts)
- Existing Worker utility and tests:
- [apps/worker/src/sync-utils.ts](apps/worker/src/sync-utils.ts)
- [apps/worker/src/sync-utils.test.ts](apps/worker/src/sync-utils.test.ts)
- Worker package tooling:
- [apps/worker/package.json](apps/worker/package.json)
- Architecture decision source:
- [docs/adr/ADR-001-api-worker-boundaries.md](docs/adr/ADR-001-api-worker-boundaries.md)
- API duplication area to track for downstream cleanup:
- [apps/api/src/modules/forms/forms.route.ts](apps/api/src/modules/forms/forms.route.ts)

## Phased Steps
1. Phase 1A: Establish extraction scaffolding and ownership boundaries
- Goal: create modular boundaries without changing behavior.
- Actions:
- Introduce module groups under [apps/worker/src](apps/worker/src) for config, state, messaging, crypto, analytics, and type definitions.
- Extract environment loading and config schema logic out of [apps/worker/src/index.ts](apps/worker/src/index.ts) into dedicated config module.
- Extract Worker state accessors out of [apps/worker/src/index.ts](apps/worker/src/index.ts) into dedicated state module.
- Keep [apps/worker/src/index.ts](apps/worker/src/index.ts) as composition root with unchanged startup order.
- Dependencies: none.
- Risk: Low.

2. Phase 1B: Extract topology and message error plumbing
- Goal: isolate messaging infrastructure concerns from runtime composition.
- Actions:
- Move topology assertion logic currently in [apps/worker/src/index.ts](apps/worker/src/index.ts) into messaging-focused module.
- Move error serialization and message decode helpers into messaging-focused module while preserving current ack or nack behavior.
- Preserve startup sequence and shutdown semantics in [apps/worker/src/index.ts](apps/worker/src/index.ts).
- Dependencies: Phase 1A.
- Risk: Medium.

3. Phase 1C: Extract credential crypto helpers
- Goal: isolate token encryption and expiration policy from orchestration.
- Actions:
- Move encryption, decryption, and token-expiry helper logic out of [apps/worker/src/index.ts](apps/worker/src/index.ts) into crypto module.
- Keep function signatures compatible to avoid runtime behavior changes.
- Add focused unit tests for extracted crypto helper module.
- Dependencies: Phase 1A.
- Risk: Medium.

4. Phase 1D: Stabilize extraction and reduce entrypoint scope
- Goal: ensure composition-root-only entrypoint behavior.
- Actions:
- Ensure [apps/worker/src/index.ts](apps/worker/src/index.ts) owns only dependency wiring, startup, consumer registration, and signal shutdown.
- Verify no direct crypto implementation, no topology implementation, and no local config schema remains in entrypoint.
- Update Worker README implementation notes to reflect new module ownership map.
- Dependencies: Phases 1B and 1C.
- Risk: Medium.

5. Phase 2A: Isolate pure analytics functions into dedicated modules
- Goal: make analytics deterministic, reusable, and testable.
- Actions:
- Extract numeric stats computation, schema shaping, question lookup, and analytics snapshot building from [apps/worker/src/index.ts](apps/worker/src/index.ts).
- Keep analytics modules free of IO, clock mutation side-effects where possible, and database access.
- Introduce controlled time injection for generated timestamps where practical to stabilize tests.
- Dependencies: Phase 1D.
- Risk: Medium.

6. Phase 2B: Build focused unit test suite for pure analytics modules
- Goal: lock behavior before later repository and processor extraction.
- Actions:
- Add unit coverage for stats edge cases:
- empty input behavior.
- odd and even median paths.
- rounding behavior and standard deviation precision.
- Add unit coverage for schema and lookup shaping:
- section ordering.
- default fallback section behavior.
- question ordering and optional fields.
- Add unit coverage for analytics snapshot:
- rating and number distributions.
- single and multi choice option distributions.
- text analytics truncation and word or char stats.
- missing or malformed answers handling.
- Dependencies: Phase 2A.
- Risk: Low.

7. Phase 2C: Baseline parity check against API analytics duplication
- Goal: prevent analytics drift while API still contains duplicated logic.
- Actions:
- Add parity fixtures that compare expected analytics shape from Worker pure modules with currently persisted analytics consumption paths in [apps/api/src/modules/forms/forms.route.ts](apps/api/src/modules/forms/forms.route.ts).
- Identify and document any divergence as tracked follow-up for later phases, without changing API behavior in this phase.
- Dependencies: Phase 2B.
- Risk: Medium.

## Testing Strategy
- Unit coverage targets:
- New analytics modules: minimum 90 percent statement coverage for pure functions.
- New crypto helper module: branch coverage for malformed payload and invalid key scenarios.
- Existing [apps/worker/src/sync-utils.test.ts](apps/worker/src/sync-utils.test.ts) remains green to protect current sync pagination behavior.
- Integration flow coverage:
- Worker startup smoke test validates unchanged boot sequence and consumer registration path through [apps/worker/src/index.ts](apps/worker/src/index.ts).
- Message parse and ack or nack behavior unchanged for valid and invalid payloads.
- Regression checks:
- Run worker test suite and typecheck after each extraction slice.
- Add snapshot tests for analytics payload shape to catch accidental schema drift.

## Risks and Mitigations
- Risk: Hidden behavior changes during extraction.
- Mitigation: one concern per PR slice, plus before and after targeted tests for each moved function group.
- Risk: Circular imports after splitting modules.
- Mitigation: enforce dependency direction: entrypoint to messaging or sync or export to db or crypto or analytics to types.
- Risk: Analytics output drift.
- Mitigation: add golden fixtures and deterministic timestamp control.
- Risk: Long-lived branch conflict with ongoing feature work.
- Mitigation: sequence extraction into short-lived PRs and merge quickly.

## Acceptance Checklist
- [ ] Entrypoint-only rule achieved in [apps/worker/src/index.ts](apps/worker/src/index.ts): bootstrap, wiring, startup, shutdown.
- [ ] Config and environment loading no longer implemented inline in [apps/worker/src/index.ts](apps/worker/src/index.ts).
- [ ] Messaging topology logic no longer implemented inline in [apps/worker/src/index.ts](apps/worker/src/index.ts).
- [ ] Credential crypto helpers no longer implemented inline in [apps/worker/src/index.ts](apps/worker/src/index.ts).
- [ ] Pure analytics logic no longer implemented inline in [apps/worker/src/index.ts](apps/worker/src/index.ts).
- [ ] New module tests added and passing for extracted pure logic.
- [ ] Existing Worker tests remain passing, including [apps/worker/src/sync-utils.test.ts](apps/worker/src/sync-utils.test.ts).
- [ ] Follow-up delta list for API analytics duplication documented against [apps/api/src/modules/forms/forms.route.ts](apps/api/src/modules/forms/forms.route.ts).

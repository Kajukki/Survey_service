---
name: Angular frontend plan
overview: "Define and deliver the Angular SPA under apps/web using standalone components, signals, and httpResource while aligning with the current local auth flow and the target API architecture."
todos:
  - id: scaffold-web
    content: Scaffold apps/web with Angular CLI (standalone, strict), app config, router, and shell layout
    status: completed
  - id: core-auth-http
    content: Implement core auth/session flow (login/register UI, session storage, refresh handling) and HTTP interceptors
    status: completed
  - id: feature-slices
    content: Complete lazy-loaded feature slices for connections, forms, sync-jobs, dashboard, exports, and sharing against real API data
    status: in_progress
  - id: contracts-integration
    content: Use shared contracts from packages/contracts for stronger adapter typing and API compatibility checks
    status: in_progress
  - id: testing-ci
    content: Add unit/integration coverage for auth/session flow, guards, interceptors, and one critical flow per feature area
    status: pending
  - id: dashboard-design
    content: Implement dashboard URL-bound filters, KPI row, deferred chart widgets, and robust empty/error states
    status: in_progress
isProject: false
---

# Angular Frontend Plan

## Current State

### Implemented

1. Auth and session foundation
- Login/register UI implemented.
- Session persistence and token handling implemented.
- Refresh retry behavior in HTTP error interceptor implemented.

2. Google provider OAuth2 linking flow
- Connections page now initiates Google OAuth2 Authorization Code + PKCE flow.
- Callback route now supports provider callback completion with state/code verifier validation via frontend pending auth context.
- Existing app auth callback token handling remains supported.

3. Route shell and guarding
- Top-level route shell and auth guard are present.
- Auth callback route remains available for compatibility.

4. Feature route scaffolding
- Dashboard, connections, forms, sync-jobs, exports, and sharing routes exist.

### In Progress

1. Data parity with backend
- Some features still depend on API paths that are currently mock-backed server-side.

2. Contract hardening
- Continued alignment needed between frontend adapters and API envelope fields.

## Target State

1. All feature reads/writes use stable, persistence-backed API endpoints.
2. Shared contract types drive frontend adapter typing for critical payloads.
3. Auth UX reflects final environment strategy without contradictory flows.

## Delivery Phases

## Phase 1: Stabilize Current Auth UX

Goal: ensure local auth flow is robust for development and integration.

1. Confirm login/register/refresh happy and unhappy paths.
2. Improve session expiry/logout transitions.
3. Add unit tests for session service and interceptors.

Exit criteria:
- Auth flow stable in local full-stack runs.

## Phase 2: Feature Data Integration

Goal: move feature pages to stable API behavior as backend completes mock replacements.

1. Keep page data access behind adapters/services.
2. Add contract checks for response shape drift.
3. Handle partial backend availability gracefully with explicit empty/error states.

Exit criteria:
- Connections/forms/sharing pages consume stable API payloads when backend persistence lands.

## Phase 3: Dashboard and Exports

Goal: deliver actionable analytics and export workflows.

1. URL-bound dashboard filters and deferred visualizations.
2. Export request and status UX.
3. One end-to-end smoke flow for dashboard or export.

Exit criteria:
- At least one critical analyst workflow runs end-to-end.

## Phase 4: Testing and CI Hardening

Goal: prevent regression across auth and data flows.

1. Add route/guard/interceptor tests.
2. Add adapter contract tests against shared DTOs.
3. Add smoke integration path in CI.

Exit criteria:
- CI enforces baseline confidence on auth and one feature flow.

## Risks

1. Backend transitional state (mock-backed routes)
- Mitigation: maintain adapter boundaries and feature-level fallback states.

2. Contract drift
- Mitigation: use shared contract types and add compatibility tests.

3. Auth model transitions
- Mitigation: keep auth-specific logic isolated in core/auth services.

## Acceptance Checklist

1. Auth/session flow is tested and stable in local development.
2. Feature pages gracefully handle loading/error/empty states.
3. Shared contract usage is expanded for critical feature payloads.
4. Dashboard and export flows have concrete integration milestones and tests.

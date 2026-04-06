# Implementation Plan: Frontend OAuth2 Flow (Google Provider)

## Overview
- Add a complete frontend OAuth2 authorization flow for Google provider linking, aligned with the existing API design and current backend route behavior.
- User impact: authenticated users can connect a Google account from the Connections page, complete consent in Google, return to the app callback route, and see updated connection state with clear success/error feedback.

## Assumptions and Constraints
- Assumption: OAuth2 flow target is Google first, using already-implemented API routes POST /providers/google/auth/start and POST /providers/google/auth/callback.
- Assumption: user must already be authenticated in local app auth before starting provider OAuth2 linking.
- Assumption: frontend uses Authorization Code with PKCE, where code verifier is generated/stored in browser for callback completion.
- Constraint: existing app auth session behavior (login/register/refresh) remains unchanged.
- Constraint: API currently enforces state ownership, redirect URI match, PKCE verifier match, and scope allowlist; frontend must pass matching values.
- Constraint: use current Angular style (standalone components, signals, httpResource where appropriate) and current testing stack (Vitest).
- Constraint: do not expose secrets in frontend; only client-safe OAuth values are handled in browser.

## Affected Areas
- Frontend routing:
  - [apps/web/src/app/app.routes.ts](apps/web/src/app/app.routes.ts)
  - [apps/web/src/app/core/auth/callback.page.ts](apps/web/src/app/core/auth/callback.page.ts)
- Frontend auth and session state:
  - [apps/web/src/app/core/auth/session.service.ts](apps/web/src/app/core/auth/session.service.ts)
  - [apps/web/src/app/core/auth/auth-api.service.ts](apps/web/src/app/core/auth/auth-api.service.ts)
- Connections feature UX:
  - [apps/web/src/app/features/connections/connections.page.ts](apps/web/src/app/features/connections/connections.page.ts)
  - [apps/web/src/app/features/connections/connections.routes.ts](apps/web/src/app/features/connections/connections.routes.ts)
- API adapter and domain typing alignment:
  - [apps/web/src/app/core/api/survey-api.adapters.ts](apps/web/src/app/core/api/survey-api.adapters.ts)
  - [apps/web/src/app/shared/models/domain.models.ts](apps/web/src/app/shared/models/domain.models.ts)
- Environment and callback URL composition:
  - [apps/web/src/environments/environment.ts](apps/web/src/environments/environment.ts)
  - [apps/web/src/environments/environment.development.ts](apps/web/src/environments/environment.development.ts)
- Existing backend/API contract references (for alignment only):
  - [apps/api/src/modules/providers/google/google-auth.route.ts](apps/api/src/modules/providers/google/google-auth.route.ts)
  - [apps/api/src/modules/providers/google/google-auth.service.ts](apps/api/src/modules/providers/google/google-auth.service.ts)
  - [docs/API-contract.md](docs/API-contract.md)

## Phased Steps
1. Phase 1: Contract and Flow Definition
- Goal: lock frontend request/response contracts and browser flow sequence before coding.
- Actions:
  - Define frontend-local types for provider auth start and callback payloads/response envelopes, aligned with API contract and route validation.
  - Define browser-side OAuth2 sequence: generate PKCE verifier/challenge, generate callback redirect URI, call start endpoint, store transient auth context, redirect to provider, parse callback params, call callback endpoint, clear transient state, refresh connection view.
  - Define route strategy for callback handling: reuse existing callback page with provider-aware mode, or introduce provider-specific callback route and keep app auth callback behavior intact.
- Dependencies: none.
- Risk: Medium (contract drift or mixed callback semantics).

2. Phase 2: PKCE and OAuth2 State Utilities
- Goal: implement reusable, testable browser utilities for secure OAuth2 handoff.
- Actions:
  - Add a small OAuth2 utility module for code verifier generation, S256 challenge derivation, random state generation, and serialization of pending auth context.
  - Add transient storage strategy (sessionStorage preferred) with TTL metadata to reduce replay/stale callback issues.
  - Add strict validation helpers for callback query parameters and stored state integrity before issuing callback API request.
- Dependencies: Phase 1 contract decisions.
- Risk: High (security-sensitive flow correctness).

3. Phase 3: Provider Auth API Service Layer
- Goal: isolate provider OAuth2 HTTP interactions behind a dedicated service.
- Actions:
  - Add provider auth methods to frontend service layer:
    - startGoogleAuth with redirectUri, codeChallenge, codeChallengeMethod, optional scopes.
    - completeGoogleAuthCallback with code, state, codeVerifier, redirectUri.
  - Normalize API envelope error handling for provider-specific failures and expose typed error outcomes to UI.
  - Ensure auth interceptor behavior remains correct for these calls (bearer token attached).
- Dependencies: Phase 2 utility outputs.
- Risk: Medium.

4. Phase 4: Connections Page Integration
- Goal: give users an explicit Connect Google action and robust in-page states.
- Actions:
  - Add Connect Google CTA, loading state, and disabled behavior while OAuth2 start is in progress.
  - On click: build redirect URI, generate PKCE/state, call start endpoint, persist transient context, then redirect browser to provider authorizationUrl.
  - Add user-visible handling for recoverable failures before redirect (network, validation, unauthorized).
  - Preserve existing connection list rendering and add refresh path after successful callback return.
- Dependencies: Phase 3 service methods.
- Risk: Medium.

5. Phase 5: Callback Route Completion
- Goal: complete provider callback exchange and navigate user predictably.
- Actions:
  - Update callback page logic to branch by callback payload shape:
    - If app auth token callback exists, keep existing behavior.
    - If provider code/state callback exists, execute provider callback completion path.
  - Validate callback query params and matching stored auth context before API callback call.
  - On success: clear transient auth context, navigate to Connections with success indicator, trigger connection refresh.
  - On failure: clear invalid state where appropriate, route to Connections with actionable error message.
- Dependencies: Phases 2 through 4.
- Risk: High (mixed callback modes in one route).

6. Phase 6: UX, Accessibility, and Error Hardening
- Goal: prevent silent failures and improve trust in auth linking flow.
- Actions:
  - Add explicit status banners/messages on Connections page for success, cancellation, state mismatch, and expired OAuth context.
  - Ensure keyboard focus placement and readable error text after callback navigation.
  - Guard against duplicate callback submissions via idempotent client behavior (single in-flight callback completion).
- Dependencies: Phase 5 behavior.
- Risk: Medium.

7. Phase 7: Documentation and Contract Sync
- Goal: keep implementation and docs coherent for future provider additions.
- Actions:
  - Update frontend plan references to include provider OAuth2 flow status.
  - Add brief flow notes in web README if callback route semantics change.
  - Confirm API contract references used in frontend remain accurate; raise follow-up if callback response shape changes.
- Dependencies: all prior phases.
- Risk: Low.

## Testing Strategy
- Unit coverage targets:
  - PKCE utility tests: verifier/challenge generation, deterministic validation expectations, malformed input handling.
  - OAuth transient storage tests: write/read/expire/clear behavior.
  - Callback parser tests: detects app-auth token mode vs provider code/state mode.
  - Service tests: start and callback request payload correctness, envelope mapping, error mapping.
- Integration flow coverage:
  - Connections page integration test: clicking Connect Google triggers start endpoint and redirect intent.
  - Callback page integration test: provider code/state path calls callback endpoint and navigates to Connections success state.
  - Callback failure test: invalid/missing state or missing verifier produces user-facing error and safe cleanup.
  - Auth continuity test: existing app auth callback token handling still works.
- Regression checks:
  - Existing session service tests remain green and are extended for callback branching.
  - No regression in auth guard behavior for protected routes.
  - No unauthorized provider API call path when user session is missing.

## Risks and Mitigations
- Risk: callback route ambiguity between app auth token callback and provider OAuth callback.
- Mitigation: explicit route-mode branching rules with dedicated tests for each mode and precedence.

- Risk: PKCE or state mismatch due to stale browser storage.
- Mitigation: TTL-based transient state, strict validation, clear stale entries on detection, and user-friendly retry path.

- Risk: redirect URI mismatch between frontend-generated callback URI and backend-stored start payload.
- Mitigation: centralize redirect URI generation in one utility and reuse in both start and callback payloads.

- Risk: OAuth popup/tab interruption leaves app in uncertain state.
- Mitigation: model callback completion as resumable only with valid stored context and provide clear reconnect CTA.

- Risk: leaking sensitive auth material in logs/errors.
- Mitigation: never log codeVerifier or auth code; map errors to safe user-facing messages.

## Acceptance Checklist
- [ ] Connections page exposes Connect Google action with loading and error states.
- [ ] Frontend generates PKCE verifier/challenge and state, persists transient OAuth2 context safely, and uses it in callback.
- [ ] Frontend calls POST /providers/google/auth/start with required payload and redirects to returned authorizationUrl.
- [ ] Callback flow calls POST /providers/google/auth/callback with code/state/codeVerifier/redirectUri and handles success/failure paths.
- [ ] Existing app auth callback token flow remains functional.
- [ ] Transient OAuth2 state is cleared on terminal success/failure and stale-state detection.
- [ ] Unit and integration tests cover happy path, cancellation/invalid state path, and callback mode branching.
- [ ] Frontend docs are updated to describe provider OAuth2 flow and callback behavior.
- [ ] No secrets are introduced in frontend code or environment files.

## Handoff Notes for TDD Agent
- Recommended red-green-refactor order:
  1. Add failing tests for PKCE utility and transient state storage.
  2. Add failing tests for provider auth service payload mapping.
  3. Add failing integration tests for Connections start flow.
  4. Add failing integration tests for callback mode branching and completion behavior.
  5. Implement minimal code per test cluster, then refactor for shared utilities.
- Keep callback branching explicit and small to reduce regressions in existing auth callback behavior.
- Prefer test fixtures that mirror current API envelope shape and 201 callback response semantics from provider route tests.

# `packages/connectors`

Provider-specific clients:

- `google/` — Google Forms / Sheets / Drive as needed
- `microsoft/` — Microsoft Graph Forms

No HTTP server here; used from `apps/worker` (and optionally `apps/api` for OAuth callbacks).

## Current Boundary

- `src/types.ts` defines provider-neutral connector interfaces used by worker orchestration.
- `src/google/google-forms-connector.ts` contains the first Google connector wrapper for:
	- OAuth authorization URL construction (PKCE-ready inputs)
	- token exchange and refresh mapping
	- form list and response page mapping to provider-neutral contracts
- `src/google/google-forms-connector.test.ts` covers request shaping and mapping behavior.

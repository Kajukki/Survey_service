# `packages/connectors`

Provider-specific clients:

- `google/` — Google Forms / Sheets / Drive as needed
- `microsoft/` — Microsoft Graph Forms

No HTTP server here; used from `apps/worker` (and optionally `apps/api` for OAuth callbacks).

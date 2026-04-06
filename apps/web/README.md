# `apps/web`

Angular application (standalone, signals-first). Configure API base URL via environment for Ingress routing.

## Toolchain

- Angular version target: v21+
- Lint: `ng lint` (Prettier violations enforced via ESLint)
- Format: `npm run format`
- Format check: `npm run format:check`

## Useful Commands

- Start dev server: `npm run start`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`

See [repository structure](../../docs/repository-structure.md).

## Google OAuth2 Provider Linking

- Google provider linking is initiated from the Connections page.
- The web app uses Authorization Code + PKCE and stores pending OAuth context in `sessionStorage`.
- Callback handling is performed by `/auth/callback`:
	- Session token callback (`?token=` or `#token=`) continues to dashboard sign-in completion.
	- Google provider callback (`?code=...&state=...`) completes provider linking and redirects to connections status.
- Connections route query params:
	- `oauth=linked` for successful link completion.
	- `oauth=error&reason=<value>` for callback/start failures.

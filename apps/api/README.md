# `apps/api`

HTTP API only: validate requests, enforce ownership and sharing rules, publish work to RabbitMQ. Long-running sync runs in `apps/worker`.

## Toolchain

- Runtime: Node.js + TypeScript
- Lint: ESLint
- Format: Prettier

## Useful Commands

- Dev watch: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Format: `npm run format`
- Format check: `npm run format:check`

See [architecture](../../docs/architecture.md).

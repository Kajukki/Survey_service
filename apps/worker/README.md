# `apps/worker`

Stateless consumers for RabbitMQ. Use separate Deployments or `WORKER_ROLE` env for sync vs analysis when needed.

Imports: `packages/connectors`, `packages/db`, `packages/messaging`.

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

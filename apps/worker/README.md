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

## Environment Variables

Required:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/surveyservice
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_PREFETCH=10
LOG_LEVEL=info
NODE_ENV=development
```

You can define these in either:

- `apps/worker/.env`
- repository root `.env`

## Local Run

```bash
npm run dev
```

Behavior:

- Consumes from `survey.sync.jobs`
- Validates payload with shared schema
- Updates `jobs` table status: `queued` -> `running` -> `succeeded` or `failed`
- Invalid payloads are dead-lettered

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
CREDENTIAL_ENCRYPTION_KEY_B64=base64-encoded-32-byte-key
CREDENTIAL_ENCRYPTION_KEY_VERSION=v1
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_AUTH_BASE_URL=https://accounts.google.com/o/oauth2/v2/auth
GOOGLE_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
GOOGLE_FORMS_API_BASE_URL=https://forms.googleapis.com/v1
EXPORT_POLL_INTERVAL_MS=5000
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
- Polls queued `export_jobs` rows and transitions them to `ready` with generated `download_url`

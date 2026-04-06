# `apps/api`

HTTP API server: validates requests, enforces ownership and sharing rules, enqueues jobs to RabbitMQ, and returns async job metadata.

## Architecture

- **Framework:** Fastify for high throughput and strong TypeScript support
- **Database:** Kysely (type-safe query builder) + pg driver with connection pooling
- **Messaging:** amqplib for RabbitMQ publish/consume
- **Validation:** Zod schemas in [packages/contracts](../../packages/contracts)
- **Auth:** JWT verification via OIDC JWKS endpoint
- **Logging:** Pino structured JSON logging
- **Metrics:** Prometheus via prom-client

## Module Layout

```
src/
├── server/              # Core server bootstrap
│   ├── create-server.ts # Fastify app setup + plugins
│   ├── config.ts        # Environment validation (Zod)
│   ├── errors.ts        # Standardized error types
│   ├── logging.ts       # Pino logger setup
│   └── types.ts         # Shared API types (Principal, ApiResponse)
├── infra/               # Infrastructure & external services
│   ├── db.ts           # Kysely + pg pool
│   ├── rabbitmq.ts     # amqplib connection management
│   └── metrics.ts      # Prometheus collectors
├── modules/            # Feature routes
│   ├── health/
│   ├── auth/
│   ├── connections/
│   ├── forms/
│   ├── sharing/
│   ├── jobs/
│   └── exports/
├── policy/             # Authorization & permissions
│   └── authorization.ts # Owner/share enforcement
└── index.ts            # Process entrypoint
```

## Environment Variables

All required:

```bash
# Server
NODE_ENV=development|staging|production
PORT=3000
LOG_LEVEL=debug|info|warn|error

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/dbname
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=2

# RabbitMQ
RABBITMQ_URL=amqp://user:pass@host/
RABBITMQ_PREFETCH=10

# Authentication (OIDC)
OIDC_ISSUER=https://your-idp.example.com
OIDC_AUDIENCE=api.example.com
OIDC_JWKS_URI=https://your-idp.example.com/.well-known/jwks.json

# CORS
ALLOWED_ORIGINS=http://localhost:4200,https://app.example.com

# Features
ENABLE_RATE_LIMITING=true
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

## Useful Commands

- Dev watch: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Format: `npm run format`
- Format check: `npm run format:check`
- Test: `npm run test`
- Test watch: `npm run test:watch`
- Test coverage: `npm run test:coverage`

## API Endpoints (v0.1)

- `GET /health` — liveness/readiness probe
- `GET /metrics` — Prometheus metrics endpoint
- `POST /api/v1/jobs/sync` — create queued sync job and publish RabbitMQ message
- `GET /api/v1/jobs` — list persisted sync jobs
- `GET /api/v1/jobs/:id` — poll persisted job status

Additional endpoints are implemented in feature modules under `modules/`.

See [docs/plans/API-design-plan.md](../../docs/plans/API-design-plan.md) for full endpoint specification and design decisions.

## Security Checklist

Before deploying:

- [ ] All secrets from environment (never hardcoded)
- [ ] JWT verification enabled and issuer/audience validated
- [ ] Rate limiting enabled on expensive endpoints
- [ ] Input validation via Zod at all boundaries
- [ ] CORS origin whitelist restricted
- [ ] Error responses do not leak sensitive data
- [ ] Owner/share authorization enforced consistently
- [ ] SQL queries parameterized (Kysely prevents injection)
- [ ] HTTPS enforced in production
- [ ] Server security headers set (@fastify/helmet)

## Local Development

To run the API as part of the full local stack (frontend + API + worker + database + RabbitMQ):

See **[LOCAL_DEVELOPMENT.md](../../LOCAL_DEVELOPMENT.md)** for the complete setup guide.

Quick start:
```bash
# Terminal 1
npm run dev

# Terminal 2 (in separate terminal, from repo root)
npm --workspace @survey-service/worker run dev

# Terminal 3 (in separate terminal, from repo root)
npm --workspace @survey-service/web run ng serve
```

(Assumes PostgreSQL and RabbitMQ are running via `docker-compose up -d` from repo root.)

## Testing the Job Queue

Once the full stack is running, trigger a sync job and observe it through the RabbitMQ → worker → database lifecycle:

```bash
# Create job
curl -X POST http://localhost:3000/api/v1/jobs/sync \
  -H "Content-Type: application/json" \
  -d '{}'

# Check RabbitMQ UI
open http://localhost:15672  # guest / guest

# Poll job status
curl http://localhost:3000/api/v1/jobs/<job_id>
```

## Related

- [docs/architecture.md](../../docs/architecture.md) — system design and data model
- [docs/plans/API-design-plan.md](../../docs/plans/API-design-plan.md) — detailed API specification
- [skills/api-design/SKILL.md](../../skills/api-design/SKILL.md) — REST API patterns
- [skills/backend-patterns/SKILL.md](../../skills/backend-patterns/SKILL.md) — backend architecture

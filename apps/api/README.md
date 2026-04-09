# `apps/api`

HTTP API server: validates requests, enforces ownership and sharing rules, enqueues jobs to RabbitMQ, and returns async job metadata.

## Implementation Status

This README separates what is implemented now from target-state architecture.

- Implemented now: local credential auth endpoints, bearer token principal extraction on protected routes, job persistence, RabbitMQ publish with confirms, worker-consumable job lifecycle.
- Partially implemented: domain routes for connections/forms/sharing are present but still mock-backed in key paths.
- Planned: full owner/share enforcement parity on all protected domain routes once DB-backed repositories replace mock paths.

## Architecture

- **Framework:** Fastify for high throughput and strong TypeScript support
- **Database:** Kysely (type-safe query builder) + pg driver with connection pooling
- **Messaging:** amqplib for RabbitMQ publish/consume
- **Validation:** Zod schemas in [packages/contracts](../../packages/contracts)
- **Auth (current):** local credential login/register/refresh with signed access tokens
- **Auth (target):** JWT verification via OIDC JWKS endpoint
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
│   ├── exports/
│   └── dashboard/
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

# Authentication
OIDC_ISSUER=https://your-idp.example.com
OIDC_AUDIENCE=api.example.com
OIDC_JWKS_URI=https://your-idp.example.com/.well-known/jwks.json
AUTH_JWT_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
CREDENTIAL_ENCRYPTION_KEY_B64=base64-encoded-32-byte-key
CREDENTIAL_ENCRYPTION_KEY_VERSION=v1

# Google OAuth provider initialization
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_AUTH_BASE_URL=https://accounts.google.com/o/oauth2/v2/auth
GOOGLE_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
GOOGLE_FORMS_API_BASE_URL=https://forms.googleapis.com/v1
GOOGLE_OAUTH_ALLOWED_SCOPES=https://www.googleapis.com/auth/forms.body.readonly,https://www.googleapis.com/auth/forms.responses.readonly

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
- `POST /api/v1/auth/register` — create a local account and issue tokens
- `POST /api/v1/auth/login` — verify credentials and issue tokens
- `POST /api/v1/auth/refresh` — rotate refresh token and issue a new access token
- `POST /api/v1/jobs/sync` — create queued sync job and publish RabbitMQ message
- `GET /api/v1/jobs` — list persisted sync jobs
- `GET /api/v1/jobs/:id` — poll persisted job status

Additional endpoints are implemented in feature modules under `modules/`.

### Endpoint Maturity

| Endpoint group | Runtime maturity |
|---|---|
| `/health`, `/metrics` | Implemented |
| `/auth/*` | Implemented with DB-backed users and refresh tokens |
| `/providers/google/auth/*` | Implemented route flow for auth start/callback with DB-backed provider auth state/connection persistence groundwork |
| `/jobs/*` | Implemented with DB + RabbitMQ publish and requester-scoped reads |
| `/connections/*` | List/delete are DB-backed with owner scoping; create remains partial |
| `/forms/*` | DB-backed list/detail and form-level sync enqueue |
| `/forms/:id/shares/*` | DB-backed list/create/delete with owner-scoped form checks |
| `/exports/*` | DB-backed list/create with owner-scoped form checks |
| `/dashboard` | Implemented analytics read endpoint returning `{ kpis, series, questions }` |

See [docs/plans/API-design-plan.md](../../docs/plans/API-design-plan.md) for full endpoint specification and design decisions.

## Security Checklist

Before deploying:

- [ ] All secrets from environment (never hardcoded)
- [x] Route-level principal extraction enabled for protected domain endpoints
- [ ] JWT verification enabled and issuer/audience validated (target IdP mode)
- [ ] Rate limiting enabled on expensive endpoints
- [ ] Input validation via Zod at all boundaries
- [ ] CORS origin whitelist restricted
- [ ] Error responses do not leak sensitive data
- [ ] Owner/share authorization enforced consistently across all routes and persistence paths
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
  -d '{"connectionId":"11111111-1111-4111-8111-111111111111"}'

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

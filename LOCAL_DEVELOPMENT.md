# Local Full-Stack Development

This guide walks through running the complete Survey Service locally: **Angular frontend** ↔ **Fastify API** ↔ **RabbitMQ** ↔ **PostgreSQL**.

## Prerequisites

- **Node.js 24+**
- **Docker & Docker Compose** (for PostgreSQL and RabbitMQ)
- **npm** (comes with Node.js)

## One-Time Setup

### 1. Install Dependencies

```bash
npm install
```

This installs all workspace dependencies for `apps/web`, `apps/api`, `apps/worker`, and shared `packages/`.

### 2. Start Infrastructure Services

```bash
docker-compose up -d
```

This brings up:
- **PostgreSQL 16** on `localhost:5432` (user: `postgres`, password: `postgres`, db: `surveyservice`)
- **RabbitMQ 3.13** on `localhost:5672` (user: `guest`, password: `guest`) with Management UI on `http://localhost:15672`

The Docker Compose file will automatically apply database migrations from `packages/db/migrations/` on initial startup.

**Verify services are ready:**

```bash
docker-compose logs -f
```

Wait for both services to show healthy status before proceeding.

## Running the Full Stack

Open **three separate terminals** in the repository root and run one service per terminal:

### Terminal 1: API Server

```bash
npm --workspace @survey-service/api run dev
```

Expected output:
```
INFO: Starting API server
WARN: RabbitMQ connection established
INFO: Health routes registered
INFO: Server started
    port: 3000
```

API is live at: `http://localhost:3000/api/v1`
Health check: `http://localhost:3000/health`

### Terminal 2: Worker (RabbitMQ Consumer)

```bash
npm --workspace @survey-service/worker run dev
```

Expected output:
```
INFO: Worker started
    queue: survey.sync.jobs
    prefetch: 10
```

The worker will consume sync jobs from RabbitMQ and update job status in the database.

### Terminal 3: Frontend (Angular)

```bash
npm --workspace @survey-service/web run ng serve
```

Expected output:
```
✔ Compiled successfully.
✔ Application bundle generation complete.

Local: http://localhost:4200/
```

Open `http://localhost:4200` in your browser.

### Development Auth Seed (Local Only)

For local development, migration `packages/db/migrations/002_auth.sql` seeds one account:

- Username: `userOne`
- Password: `passwordOne`

This seed is intended for local environments only.

## Testing the Queue: End-to-End Job Sync

Once all three services are running:

### 1. Create a Sync Job via API

```bash
curl -X POST http://localhost:3000/api/v1/jobs/sync \
  -H "Content-Type: application/json" \
  -d '{"connectionId": "11111111-1111-4111-8111-111111111111"}'
```

Expected response (HTTP 202):
```json
{
  "success": true,
  "data": {
    "job_id": "<uuid>",
    "status": "queued",
    "type": "sync"
  }
}
```

### 2. Observe the Queue in RabbitMQ

Open `http://localhost:15672` (guest / guest) and navigate to **Queues** → **survey.sync.jobs**.
You should see the message in the queue.

### 3. Worker Consumes the Job

Check the **Terminal 2** (worker) logs. It will mark the job as `running` and then `succeeded`.

### 4. Poll Job Status from API

```bash
curl http://localhost:3000/api/v1/jobs/<job_id>
```

You should see the job status progressing: `queued` → `running` → `succeeded`.

### 5. View in Frontend (if implemented)

The Angular app can be extended to call `GET /api/v1/jobs/<job_id>` and display status updates. See [apps/web/README.md](apps/web/README.md) for frontend integration details.

## Testing Local Authentication Flow

Use this quick sequence to verify register/login/refresh behavior in local development.

### 1. Login With Seeded Account

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"userOne","password":"passwordOne"}'
```

Expected: `200 OK` with `accessToken`, `refreshToken`, `tokenType`, `expiresIn`, and `user`.

### 2. Refresh Session

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh_token_from_login>"}'
```

Expected: `200 OK` with rotated token pair.

### 3. Register New Account (Optional)

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"userTwo","password":"passwordTwo"}'
```

Expected: `201 Created` with session payload.

## Logs and Debugging

### View All Service Logs

```bash
docker-compose logs -f
```

### View API Logs

Check Terminal 1 (API dev server) for detailed pino logs with `requestId` correlation.

### View Worker Logs

Check Terminal 2 (Worker) for message consume/ack/nack events and job transitions.

### View Database

Connect with any PostgreSQL client:

```bash
psql postgresql://postgres:postgres@localhost:5432/surveyservice
```

List jobs:
```sql
SELECT id, status, created_at, completed_at FROM jobs ORDER BY created_at DESC LIMIT 10;
```

### RabbitMQ Management UI

Visit `http://localhost:15672` (guest / guest):
- **Queues**: View pending messages in `survey.sync.jobs`
- **Connections**: See API and Worker connections
- **Channels**: Verify prefetch settings

## Common Issues

### PostgreSQL Connection Fails

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**
```bash
docker-compose up -d postgres
docker-compose logs postgres
```

Ensure `postgres_data` volume has write permissions.

### RabbitMQ Connection Fails

```
Error: connect ECONNREFUSED 127.0.0.1:5672
```

**Fix:**
```bash
docker-compose up -d rabbitmq
docker-compose logs rabbitmq
```

### API Returns 500 on /jobs/sync

**Likely cause:** DB is not ready or migrations not applied.

**Fix:**
1. Check PostgreSQL is running: `docker-compose logs postgres`
2. Verify migrations table exists: `psql ... -c "SELECT * FROM jobs LIMIT 1;"`
3. If missing, the migration should auto-run on container startup. Restart: `docker-compose restart postgres`

### Worker Not Consuming Messages

**Fix:**
1. Verify RabbitMQ is healthy: `docker-compose logs rabbitmq`
2. Check worker logs (Terminal 2) for connection errors
3. Confirm worker env vars: `cat apps/worker/.env`

## Stopping the Stack

### Stop Services (Keep Data)

```bash
# Terminal 1: Ctrl+C (API)
# Terminal 2: Ctrl+C (Worker)
# Terminal 3: Ctrl+C (Frontend)

docker-compose stop
```

### Full Cleanup (Remove Volumes)

```bash
docker-compose down -v
```

This removes containers and local PostgreSQL/RabbitMQ data. Be careful—this deletes test data.

## Next Steps

- **Frontend integration:** Implement sync job polling UI in Angular (see [apps/web/README.md](apps/web/README.md))
- **Worker logic:** Add provider-specific sync handlers in [apps/worker/src/index.ts](apps/worker/src/index.ts)
- **Database schema:** Extend tables (connections, forms, responses) in [packages/db/migrations/](packages/db/migrations/)
- **Tests:** Run `npm run test` to validate all changes

## Environment Variables Reference

### API (`apps/api/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | development | Runtime environment |
| `PORT` | 3000 | HTTP port |
| `LOG_LEVEL` | debug | Pino log level |
| `DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `RABBITMQ_URL` | amqp://... | RabbitMQ broker URL |
| `RABBITMQ_PREFETCH` | 10 | Consumer prefetch count |
| `AUTH_JWT_SECRET` | (required) | HS256 signing secret for local auth tokens |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Access token lifetime in seconds |
| `REFRESH_TOKEN_TTL_SECONDS` | 604800 | Refresh token lifetime in seconds |

### Worker (`apps/worker/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | development | Runtime environment |
| `LOG_LEVEL` | debug | Pino log level |
| `DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `RABBITMQ_URL` | amqp://... | RabbitMQ broker URL |
| `RABBITMQ_PREFETCH` | 10 | Consumer prefetch count |

### Web (`apps/web/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | development | Angular ivy build mode |

## References

- [API Architecture](docs/architecture.md)
- [Repository Structure](docs/repository-structure.md)
- [API Implementation Guide](IMPLEMENTATION_GUIDE.md)

# Implementation Plan: API Design

## Overview
- Provide a consistent, secure, and well-documented RESTful API for the Angular frontend to interact with the Survey Service.
- The API will serve as a thin orchestration layer, handling authentication, authorization (per-user data ownership and sharing), input validation, CRUD operations for configuration, and enqueueing asynchronous jobs to RabbitMQ for workers to process.
- Designed in accordance with `architecture.md` and the REST API conventions defined in `api-design/SKILL.md`.

## Assumptions and Constraints
- The API is stateless and horizontally scalable, deployed via Kubernetes and exposed through an NGINX Ingress.
- Data ownership is strictly enforced: resources are accessible if the `owner_user_id` matches the current user, or if explicit sharing grants exist.
- Long-running tasks (e.g., syncing forms, generating exports, or heavy analysis) are not executed synchronously in HTTP requests. The API enqueues these jobs and returns a `202 Accepted` status with job tracking information.
- Authentication utilizes the organization's IdP (e.g., via JWTs).
- All endpoints use a standard JSON response envelope for success, errors, and pagination.

## Affected Areas
- **API Runtime Configuration:** Fastify setup, routing, and error handling (`apps/api/src/server/`).
- **Data Contracts:** Shared Zod schemas and TypeScript types (`packages/contracts/`).
- **Database Access:** Repositories with tenant-aware queries (`apps/api/src/modules/` and `apps/api/src/policy/`).
- **Messaging:** Job publishing interfaces (`apps/api/src/infra/rabbitmq.ts`, `packages/messaging/`).
- **API Implementation Files:** Route handlers and services for all domains (`auth`, `connections`, `forms`, `sharing`, `jobs`, `exports`).

## Phased Steps

1. **Phase 1: API Contracts & Shared Schemas** (Goal: Define request/response shapes)
   - Define exact Zod schemas for entity DTOs (Connection, Form, Share, Job, Export).
   - Define standard response envelopes (`ApiResponse`, `ApiError`, `PaginationMeta`) in `packages/contracts`.
   - *Risk Level: Low*

2. **Phase 2: Core Platform & Security Middleware** (Goal: Setup HTTP server and authz)
   - Configure Fastify with `helmet`, `cors`, and structured JSON logging (`pino`).
   - Implement authentication middleware to verify JWTs and inject the current user identity.
   - Implement authorization utilities (`canRead`, `canEdit`) that check ownership and share policies.
   - *Risk Level: Medium*

3. **Phase 3: Synchronous CRUD Endpoints** (Goal: Connections, Forms, and Sharing APIs)
   - Implement `GET /api/v1/connections` and related CRUD endpoints.
   - Implement `GET /api/v1/forms` (with offset pagination) and `GET /api/v1/forms/:id`.
   - Implement `POST /api/v1/forms/:id/shares` and related endpoints for managing access.
   - *Risk Level: Low*

4. **Phase 4: Asynchronous Job Enqueueing & Tracking** (Goal: Manual syncs and exports)
   - Implement `POST /api/v1/jobs` (or domain-specific triggers like `POST /api/v1/forms/:id/sync`) which validates access, writes a job record to PostgreSQL, and publishes to RabbitMQ via `amqplib` (using Publisher Confirms).
   - Implement `GET /api/v1/jobs/:id` for the frontend to poll status.
   - *Risk Level: High (requires transactional consistency between DB and RabbitMQ)*

5. **Phase 5: Aggregation & Analysis Read Endpoints** (Goal: Dashboard data)
   - Implement endpoints to serve aggregated data (e.g., `GET /api/v1/forms/:id/analytics`) by querying materialized views or summary tables populated by workers.
   - *Risk Level: Medium*

## Testing Strategy
- **Unit Coverage:** Target 80%+ for services, authorization policy functions, and Zod validators.
- **Integration Flow Coverage:** Test API endpoint routes using tools like `supertest` or Fastify's `inject`, combined with a test database container (e.g., Testcontainers) to verify DB queries, RLS/authz rules, and RabbitMQ publish mocks.
- **Regression Checks:** Ensure unauthorized access returns `403 Forbidden` or `404 Not Found` (to prevent data enumeration).

## Risks and Mitigations
- **Risk:** Distributed transaction failure (DB write succeeds but RabbitMQ publish fails).
  - *Mitigation:* Implement an Outbox pattern or ensure robust error handling with publisher confirms. If publish fails, the API can rollback the job creation or mark it as `failed_to_queue`.
- **Risk:** Frontend polling overwhelming the API.
  - *Mitigation:* Apply rate limiting on job status endpoints (`@fastify/rate-limit`). Design the frontend to use exponential backoff when polling `GET /jobs/:id`.

## Acceptance Checklist
- [ ] API endpoints adhere to the URL structure and status codes in `api-design/SKILL.md`.
- [ ] Zod schemas and TypeScript types are exported from `packages/contracts`.
- [ ] Authentication middleware actively rejects invalid tokens with `401 Unauthorized`.
- [ ] Forms and Connections list/detail endpoints strictly filter by `owner_user_id` or active shares.
- [ ] Sync and Export endpoints successfully enqueue messages to RabbitMQ and return `202 Accepted`.
- [ ] Standardized JSON error format is used for all `4xx` and `5xx` responses.
- [ ] Integration tests verify that cross-tenant data access is blocked.
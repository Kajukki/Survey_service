# Survey Service - API Contract

This document defines the REST API contract for the Survey Service, providing a standard interface for the Angular frontend to consume.

## Contract Mode

This document is a transitional contract for active development.

- `Implemented`: behavior exists and is active in runtime.
- `Partial`: route exists but still uses mock-backed or temporary behavior.
- `Planned`: contract target exists, implementation still pending.

## Base URL
All requests should be prefixed with `/api/v1`.

## Authentication & Authorization
- **Current mode:** local credential auth (`/auth/register`, `/auth/login`, `/auth/refresh`) returns bearer access tokens and refresh tokens.
- **Implemented mode selection:** `AUTH_MODE=local|oidc` controls protected-route token verification strategy.
- **Target mode:** external IdP JWT verification with full owner/share policy checks at every protected route.
- **Implemented in current runtime:** protected domain routes require a valid bearer token-backed request principal.

### Auth Mode Matrix

| Mode | Verification strategy | Required env |
|---|---|---|
| `local` | HS256 shared secret token verification | `AUTH_MODE`, `AUTH_JWT_SECRET`, `OIDC_ISSUER`, `OIDC_AUDIENCE` |
| `oidc` | OIDC remote JWKS token verification | `AUTH_MODE`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI` |

## Common Data Formats

### Success Envelope (Single Resource)
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "...": "..."
  },
  "meta": {
    "requestId": "req-123"
  }
}
```

### Success Envelope (Collection with Pagination)
```json
{
  "success": true,
  "data": [
    { "id": "123e4567-e89b-12d3...", "name": "..." }
  ],
  "meta": {
    "requestId": "req-123",
    "total": 45,
    "page": 1,
    "perPage": 20,
    "totalPages": 3
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "Invalid request parameters.",
    "details": [
      { "field": "provider", "message": "Unsupported provider type.", "code": "invalid_enum" }
    ]
  },
  "meta": {
    "requestId": "req-123"
  }
}
```

---

## 1. System

### `GET /health`
Returns service readiness and liveness information. No authentication required.
- **Status:** `Implemented`
- **200 OK**: `{ "status": "ok", "version": "1.0.0" }`

---

## 2. Authentication

### `POST /api/v1/auth/register`
Register a local account and return an authenticated session payload.
- **Status:** `Implemented`
- **Body:** `{ "username": "newUser", "password": "strongPassword" }`
- **201 Created**: Returns `{ accessToken, refreshToken, tokenType, expiresIn, user }`.

### `POST /api/v1/auth/login`
Authenticate using username/password and return session tokens.
- **Status:** `Implemented`
- **Body:** `{ "username": "existingUser", "password": "yourPassword" }`
- **200 OK**: Returns `{ accessToken, refreshToken, tokenType, expiresIn, user }`.

### `POST /api/v1/auth/refresh`
Exchange a valid refresh token for a rotated refresh token and a new access token.
- **Status:** `Implemented`
- **Body:** `{ "refreshToken": "opaque-refresh-token" }`
- **200 OK**: Returns `{ accessToken, refreshToken, tokenType, expiresIn, user }`.

### Local seed account
- A local development seed account exists; see `LOCAL_DEVELOPMENT.md` for dev-only setup details.

### `POST /api/v1/providers/google/auth/start`
Start Google OAuth authorization for the authenticated user using PKCE parameters.
- **Status:** `Implemented`
- **Body:** `{ "redirectUri": "https://app.example.com/providers/google/callback", "codeChallenge": "...", "codeChallengeMethod": "S256", "scopes": ["..."] }`
- **200 OK**: Returns provider authorization URL payload.

### `POST /api/v1/providers/google/auth/callback`
Complete Google OAuth authorization code exchange and create/update a linked provider connection.
- **Status:** `Implemented` (DB-backed provider auth state + provider connection persistence scaffolding)
- **Body:** `{ "code": "auth-code", "state": "...", "codeVerifier": "...", "redirectUri": "https://app.example.com/providers/google/callback" }`
- **201 Created**: Returns linked Google connection summary.

---

## 3. Connections
Manages integrations with external survey providers (Google Forms, Microsoft Forms).

Current implementation note: list/create/delete paths are DB-backed with owner-scoped access checks.

### `GET /api/v1/connections`
List all configured connections for the authenticated user.
- **Status:** `Implemented`
- **200 OK**: Returns paginated collection of `Connection` objects.

### `POST /api/v1/connections`
Create a new provider connection.
- **Status:** `Implemented`
- **Body:** `{ "type": "google|microsoft", "name": "My Workspace", "externalId": "provider-id", "credentialToken": "opaque-token" }`
- **201 Created**: Returns the created `Connection` object.

### `DELETE /api/v1/connections/:id`
Revoke and remove a provider connection.
- **Status:** `Implemented`
- **204 No Content**: Successful deletion.
- **404 Not Found**: Connection not found or not accessible to requester.

---

## 4. Forms
Manages ingested survey configurations and metadata.

Current implementation note: list/detail and form-level sync trigger are DB-backed in runtime.

### `GET /api/v1/forms`
List forms owned by or shared with the user.
- **Status:** `Implemented`
- **Query Params:** `?page=1&perPage=20&search=survey&connectionId=...`
- **200 OK**: Returns paginated collection of `Form` objects.

### `GET /api/v1/forms/:id`
Get detailed metadata for a specific form.
- **Status:** `Implemented`
- **200 OK**: Returns the `Form` object.
- **403 / 404**: Unauthorized or not found.

### `GET /api/v1/forms/:id/structure`
Get ordered form structure (sections + questions) for the specified form.
- **Status:** `Implemented`
- **200 OK**: Returns `{ form, sections, questionCount }`.
- **404 Not Found**: Form not found or not accessible to requester.

### `GET /api/v1/forms/:id/responses`
List response summaries for a form with server-side filtering and pagination.
- **Status:** `Implemented`
- **Query Params:** `page`, `perPage`, `from`, `to`, `questionId`, `answerContains`, `completion`
- **200 OK**: Returns `{ responses, appliedFilters }` with pagination metadata.
- **404 Not Found**: Form not found or not accessible to requester.

### `POST /api/v1/forms/:id/sync`
Trigger a manual synchronization job for the specified form.
- **Status:** `Implemented`
- **202 Accepted**: Enqueues a job to RabbitMQ.
- **404 Not Found**: Form not found or not accessible to requester.
- **Response:**
  ```json
  {
    "data": {
      "job_id": "job-uuid-1234",
      "status": "queued",
      "type": "sync_form"
    }
  }
  ```

---

## 5. Sharing
Manages access grants to resources.

Current implementation note: sharing routes are DB-backed with owner-scoped form checks.

### `GET /api/v1/forms/:id/shares`
List all users/groups who have access to this form.
- **Status:** `Implemented`
- **200 OK**: Returns collection of `Share` objects.
- **404 Not Found**: Form not found or not accessible to requester.

### `POST /api/v1/forms/:id/shares`
Grant access to another user in the organization.
- **Status:** `Implemented`
- **Body:** `{ "grantee_user_id": "user-uuid", "permission_level": "read" }`
- **201 Created**: Returns the created `Share`.
- **404 Not Found**: Form not found or not accessible to requester.

### `DELETE /api/v1/forms/:id/shares/:share_id`
Revoke access.
- **Status:** `Implemented`
- **204 No Content**: Successfully revoked.
- **404 Not Found**: Form or share not found, or not accessible to requester.

---

## 6. Jobs & Async Operations
Used by the frontend to poll for long-running task status (syncs, exports).

Current implementation note: `/jobs/sync`, `/jobs`, and `/jobs/:id` are implemented with persisted jobs and RabbitMQ publish; list/detail reads are scoped to the authenticated requester.

### `POST /api/v1/jobs/sync`
Create and enqueue a sync job.
- **Status:** `Implemented`

### `GET /api/v1/jobs`
List sync jobs for current request context.
- **Status:** `Implemented`

### `GET /api/v1/jobs/:id`
Check the status of a previously enqueued job.
- **Status:** `Implemented`
- **200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "id": "job-uuid-1234",
      "status": "queued|running|succeeded|failed",
      "result": {
        "sync_count": 45,
        "errors": []
      },
      "created_at": "...",
      "completed_at": "..."
    },
    "meta": {
      "requestId": "req-123"
    }
  }
  ```

---

## 7. Exports
Data extraction endpoints.

### `GET /api/v1/exports`
List export jobs for the authenticated requester.
- **Status:** `Implemented`
- **200 OK**: Returns paginated collection of export job summaries.

### `POST /api/v1/exports`
Trigger an async export generation for form responses.
- **Status:** `Implemented`
- **Body:** `{ "formId": "form-uuid", "format": "csv|json|excel" }`
- **202 Accepted**: Returns queued export job metadata.

### `GET /api/v1/exports/:id`
Get export job status and metadata for the authenticated requester.
- **Status:** `Implemented`
- **200 OK**: Returns export detail payload including `status`, `requested_at`, `completed_at`, `download_url`, and `error`.
- **404 Not Found**: Export not found or not accessible to requester.

### `GET /api/v1/exports/:id/download`
Resolve a ready export download URL for the authenticated requester.
- **Status:** `Implemented`
- **200 OK**: Returns `{ id, download_url }` when export is ready.
- **404 Not Found**: Export not found or not accessible to requester.
- **409 Conflict**: Export exists but is not ready for download.

---

## 8. Dashboard Analytics

### `GET /api/v1/dashboard`
Read dashboard metrics for a form and date range.
- **Status:** `Implemented`
- **Query Params:** `?formId=<uuid>&from=<iso-date>&to=<iso-date>&granularity=day|week|month&questionId=<optional-uuid>`
- **200 OK**: Returns dashboard payload with `{ kpis, series, questions }`.
- **404 Not Found**: Form not found or not accessible to requester.
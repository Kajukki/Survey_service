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
- **Target mode:** external IdP JWT verification with full owner/share policy checks at every protected route.
- **Implemented in current runtime:** protected domain routes require a valid bearer token-backed request principal.
- **Important:** owner/share authorization parity is still in progress for mock-backed domain paths.

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
- **Status:** `Implemented` (connection persistence is currently temporary store backed)
- **Body:** `{ "code": "auth-code", "state": "...", "codeVerifier": "...", "redirectUri": "https://app.example.com/providers/google/callback" }`
- **201 Created**: Returns linked Google connection summary.

---

## 3. Connections
Manages integrations with external survey providers (Google Forms, Microsoft Forms).

Current implementation note: route surface is present, but persistence and policy enforcement are still being completed.

### `GET /api/v1/connections`
List all configured connections for the authenticated user.
- **Status:** `Partial` (currently mock-backed)
- **200 OK**: Returns paginated collection of `Connection` objects.

### `POST /api/v1/connections`
Create a new provider connection.
- **Status:** `Partial` (currently mock-backed)
- **Body:** `{ "type": "google|microsoft", "name": "My Workspace", "externalId": "provider-id", "credentialToken": "opaque-token" }`
- **201 Created**: Returns the created `Connection` object.

### `DELETE /api/v1/connections/:id`
Revoke and remove a provider connection.
- **Status:** `Partial` (route implemented; persistence integration pending)
- **204 No Content**: Successful deletion.
- **404 Not Found**: Connection not found or not accessible to requester.

---

## 4. Forms
Manages ingested survey configurations and metadata.

Current implementation note: route surface is present and responses are currently mock-backed for list/detail in active development.

### `GET /api/v1/forms`
List forms owned by or shared with the user.
- **Status:** `Partial` (currently mock-backed)
- **Query Params:** `?page=1&perPage=20&search=survey&connectionId=...`
- **200 OK**: Returns paginated collection of `Form` objects.

### `GET /api/v1/forms/:id`
Get detailed metadata for a specific form.
- **Status:** `Partial` (currently mock-backed)
- **200 OK**: Returns the `Form` object.
- **403 / 404**: Unauthorized or not found.

### `POST /api/v1/forms/:id/sync`
Trigger a manual synchronization job for the specified form.
- **Status:** `Partial` (currently returns placeholder `job_id` in forms module)
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

Current implementation note: route surface is present and currently mock-backed, with owner-scoped access checks on form shares.

### `GET /api/v1/forms/:id/shares`
List all users/groups who have access to this form.
- **Status:** `Partial` (currently mock-backed)
- **200 OK**: Returns collection of `Share` objects.
- **404 Not Found**: Form not found or not accessible to requester.

### `POST /api/v1/forms/:id/shares`
Grant access to another user in the organization.
- **Status:** `Partial` (currently mock-backed)
- **Body:** `{ "grantee_user_id": "user-uuid", "permission_level": "read" }`
- **201 Created**: Returns the created `Share`.
- **404 Not Found**: Form not found or not accessible to requester.

### `DELETE /api/v1/forms/:id/shares/:share_id`
Revoke access.
- **Status:** `Partial` (currently mock-backed)
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

### `POST /api/v1/exports`
Trigger an async export generation for form responses.
- **Status:** `Planned`
- **Body:** `{ "form_id": "form-uuid", "format": "csv" }`
- **202 Accepted**: Returns job track info similar to form sync. Download URL will be provided in the job result once `completed`.
# Survey Service - API Contract

This document defines the REST API contract for the Survey Service, providing a standard interface for the Angular frontend to consume.

## Base URL
All requests should be prefixed with `/api/v1`.

## Authentication & Authorization
- **Header:** `Authorization: Bearer <JWT>`
- **Identity:** All resources are strictly scoped. Users can only access resources where they are the `owner_user_id` or have explicit `shares` granted to them.

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
- **200 OK**: `{ "status": "ok", "version": "1.0.0" }`

---

## 2. Connections
Manages integrations with external survey providers (Google Forms, Microsoft Forms).

### `GET /api/v1/connections`
List all configured connections for the authenticated user.
- **200 OK**: Returns paginated collection of `Connection` objects.

### `POST /api/v1/connections`
Create a new provider connection.
- **Body:** `{ "type": "google|microsoft", "name": "My Workspace", "externalId": "provider-id", "credentialToken": "opaque-token" }`
- **201 Created**: Returns the created `Connection` object.

### `DELETE /api/v1/connections/:id`
Revoke and remove a provider connection.
- **204 No Content**: Successful deletion.

---

## 3. Forms
Manages ingested survey configurations and metadata.

### `GET /api/v1/forms`
List forms owned by or shared with the user.
- **Query Params:** `?page=1&perPage=20&search=survey&connectionId=...`
- **200 OK**: Returns paginated collection of `Form` objects.

### `GET /api/v1/forms/:id`
Get detailed metadata for a specific form.
- **200 OK**: Returns the `Form` object.
- **403 / 404**: Unauthorized or not found.

### `POST /api/v1/forms/:id/sync`
Trigger a manual synchronization job for the specified form.
- **202 Accepted**: Enqueues a job to RabbitMQ.
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

## 4. Sharing
Manages access grants to resources.

### `GET /api/v1/forms/:id/shares`
List all users/groups who have access to this form.
- **200 OK**: Returns collection of `Share` objects.

### `POST /api/v1/forms/:id/shares`
Grant access to another user in the organization.
- **Body:** `{ "grantee_user_id": "user-uuid", "permission_level": "read" }`
- **201 Created**: Returns the created `Share`.

### `DELETE /api/v1/forms/:id/shares/:share_id`
Revoke access.
- **204 No Content**: Successfully revoked.

---

## 5. Jobs & Async Operations
Used by the frontend to poll for long-running task status (syncs, exports).

### `GET /api/v1/jobs/:id`
Check the status of a previously enqueued job.
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

## 6. Exports
Data extraction endpoints.

### `POST /api/v1/exports`
Trigger an async export generation for form responses.
- **Body:** `{ "form_id": "form-uuid", "format": "csv" }`
- **202 Accepted**: Returns job track info similar to form sync. Download URL will be provided in the job result once `completed`.
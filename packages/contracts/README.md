# `packages/contracts`

Shared API and message contracts using Zod for validation.

Single source of truth for request/response DTOs, RabbitMQ payloads, and types shared across:
- `apps/api` — request validation, response shaping
- `apps/worker` — message deserialization and processing
- `apps/web` (optional) — if generating typed API client

## Exports

- **API Schemas:** `ApiResponseSchema`, `ApiErrorResponseSchema`, `PaginationQuerySchema`
- **Connection DTOs:** `ConnectionSchema`, `CreateConnectionSchema`
- **Form DTOs:** `FormSchema`
- **Job DTOs:** `SyncJobSchema`, `ExportJobSchema`, `JobStatusSchema`
- **Share DTOs:** `ShareSchema`, `PermissionSchema`

## Usage

```typescript
import { ConnectionSchema, CreateConnectionSchema } from '@survey-service/contracts'

// Parse and validate user input
const validated = CreateConnectionSchema.parse(req.body)

// Infer TypeScript type
type Connection = z.infer<typeof ConnectionSchema>
```

## Build

```bash
npm run build     # Generate dist/
npm run typecheck # Type-check only
```

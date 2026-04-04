# `packages/messaging`

RabbitMQ topology, message schemas, and channel configuration.

Defines:
- Exchange names and durability settings
- Queue names and bindings
- Routing keys for message routing
- Message payload schemas (Zod-validated)
- Publisher and consumer configuration

Used by:
- `apps/api` — publishes sync/export jobs to RabbitMQ
- `apps/worker` — consumes messages from queues
- `apps/scheduler` — publishes scheduled sync messages

## Exports

- **Constants:** `EXCHANGES`, `QUEUES`, `ROUTING_KEYS`
- **Schemas:** `SyncJobMessageSchema`, `AnalysisJobMessageSchema`, `DeadLetterMessageSchema`
- **Configuration:** `QUEUE_CONFIG`, `BINDINGS`, `PUBLISHER_OPTIONS`

## Setup

Before publishing or consuming, ensure exchanges and queues are declared.

```typescript
import { EXCHANGES, QUEUES, ROUTING_KEYS, QUEUE_CONFIG } from '@survey-service/messaging'

// Create exchange
await channel.assertExchange(EXCHANGES.SYNC, 'topic', { durable: true })

// Create queue with DLX
await channel.assertQueue(QUEUES.SYNC_JOBS, QUEUE_CONFIG[QUEUES.SYNC_JOBS])

// Bind
await channel.bindQueue(QUEUES.SYNC_JOBS, EXCHANGES.SYNC, ROUTING_KEYS.SYNC_CONNECTION)
```

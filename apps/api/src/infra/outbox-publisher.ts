import { sql, type Kysely } from 'kysely';
import { QUEUES } from '@survey-service/messaging';
import type { Database } from '@survey-service/db';
import type { SyncJobMessage } from '@survey-service/messaging';
import type { Logger } from 'pino';
import type { Metrics } from './metrics';
import type { RabbitMQClient } from './rabbitmq';

interface ClaimedOutboxEventRow {
  id: string;
  payload_json: unknown;
  attempt_count: number;
}

export interface OutboxPublisher {
  start(): void;
  stop(): void;
  processOnce(): Promise<number>;
}

function parseOutboxLagSeconds(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) {
    return null;
  }

  return Math.max(0, (Date.now() - candidate.timestamp) / 1000);
}

export function createOutboxPublisher(deps: {
  db: Kysely<Database>;
  rabbitmq: RabbitMQClient;
  logger: Logger;
  metrics?: Metrics;
  batchSize: number;
  pollIntervalMs: number;
  maxAttempts: number;
  retryBaseMs: number;
}): OutboxPublisher {
  let timer: NodeJS.Timeout | undefined;
  let processing = false;
  const eventType = 'sync_job.queued';

  const computeBackoff = (attemptCount: number) => {
    const exponent = Math.min(attemptCount, 6);
    return deps.retryBaseMs * 2 ** exponent;
  };

  const claimEvents = async (): Promise<ClaimedOutboxEventRow[]> => {
    const claimed = await sql<ClaimedOutboxEventRow>`
      UPDATE outbox_events
      SET status = 'processing',
          locked_at = NOW(),
          updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = 'pending'
          AND available_at <= NOW()
          AND attempt_count < ${deps.maxAttempts}
        ORDER BY created_at ASC
        LIMIT ${deps.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, payload_json, attempt_count
    `.execute(deps.db);

    return claimed.rows;
  };

  const markPublished = async (eventId: string) => {
    await deps.db
      .updateTable('outbox_events')
      .set({
        status: 'published',
        published_at: new Date(),
        locked_at: null,
        last_error: null,
        updated_at: new Date(),
      })
      .where('id', '=', eventId)
      .executeTakeFirst();
  };

  const markFailed = async (event: ClaimedOutboxEventRow, error: unknown) => {
    const nextAttemptCount = event.attempt_count + 1;
    const exceeded = nextAttemptCount >= deps.maxAttempts;
    const delayMs = computeBackoff(event.attempt_count);

    await deps.db
      .updateTable('outbox_events')
      .set({
        status: exceeded ? 'failed' : 'pending',
        attempt_count: nextAttemptCount,
        available_at: new Date(Date.now() + delayMs),
        locked_at: null,
        last_error: error instanceof Error ? error.message.slice(0, 1024) : 'Unknown publish error',
        updated_at: new Date(),
      })
      .where('id', '=', event.id)
      .executeTakeFirst();
  };

  const processOnce = async (): Promise<number> => {
    if (processing) {
      return 0;
    }

    processing = true;
    try {
      const claimed = await claimEvents();
      if (claimed.length === 0) {
        return 0;
      }

      for (const event of claimed) {
        const message = event.payload_json as SyncJobMessage;
        const publishStartedAt = process.hrtime.bigint();

        const lagSeconds = parseOutboxLagSeconds(event.payload_json);
        if (lagSeconds !== null) {
          deps.metrics?.outboxLagSeconds.labels(eventType).observe(lagSeconds);
        }

        try {
          await deps.rabbitmq.publishSyncJob(message);
          await markPublished(event.id);

          const durationSeconds = Number(process.hrtime.bigint() - publishStartedAt) / 1_000_000_000;
          deps.metrics?.queuePublishDuration.labels(QUEUES.SYNC_JOBS, 'success').observe(durationSeconds);

          deps.logger.info(
            {
              outboxEventId: event.id,
              jobId: message.jobId,
              requesterId: message.requestedBy,
              attempts: event.attempt_count + 1,
            },
            'Outbox event published',
          );
        } catch (error) {
          const durationSeconds = Number(process.hrtime.bigint() - publishStartedAt) / 1_000_000_000;
          const errorCode = error instanceof Error ? error.name : 'unknown_error';

          deps.metrics?.queuePublishDuration.labels(QUEUES.SYNC_JOBS, 'error').observe(durationSeconds);
          deps.metrics?.queuePublishErrorCount.labels(QUEUES.SYNC_JOBS, errorCode).inc();
          deps.metrics?.outboxPublishFailureCount.labels(eventType, errorCode).inc();

          deps.logger.warn(
            {
              outboxEventId: event.id,
              jobId: message.jobId,
              requesterId: message.requestedBy,
              attempts: event.attempt_count + 1,
              err: error,
            },
            'Outbox publish attempt failed',
          );
          await markFailed(event, error);
        }
      }

      return claimed.length;
    } finally {
      processing = false;
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        processOnce().catch((error) => {
          deps.logger.error({ err: error }, 'Outbox polling cycle failed');
        });
      }, deps.pollIntervalMs);

      // Trigger a first pass immediately on startup.
      processOnce().catch((error) => {
        deps.logger.error({ err: error }, 'Initial outbox polling cycle failed');
      });

      deps.logger.info(
        {
          pollIntervalMs: deps.pollIntervalMs,
          batchSize: deps.batchSize,
          maxAttempts: deps.maxAttempts,
        },
        'Outbox publisher started',
      );
    },

    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
      deps.logger.info('Outbox publisher stopped');
    },

    processOnce,
  };
}


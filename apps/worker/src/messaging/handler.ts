import type { Channel, ConsumeMessage } from 'amqplib';
import type { Logger } from 'pino';
import type { Pool } from 'pg';
import { SyncJobMessageSchema, type SyncJobMessage } from '@survey-service/messaging';
import type { WorkerConfig } from '../config.js';
import { markJobFailed, markJobRunning, markJobSucceeded } from '../db/jobs.js';
import { extractErrorMessage, processSyncJob, SyncJobProcessingError } from '../sync/processor.js';

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof SyncJobProcessingError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context: error.context,
      cause: serializeError(error.causeError),
    };
  }

  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const withKnownFields = error as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
      response?: {
        status?: number;
        data?: unknown;
      };
      cause?: unknown;
    };

    if (withKnownFields.code) {
      details.code = withKnownFields.code;
    }

    if (withKnownFields.status !== undefined) {
      details.status = withKnownFields.status;
    }

    if (withKnownFields.statusCode !== undefined) {
      details.statusCode = withKnownFields.statusCode;
    }

    if (withKnownFields.response?.status !== undefined) {
      details.responseStatus = withKnownFields.response.status;
    }

    if (withKnownFields.response?.data !== undefined) {
      details.responseData = withKnownFields.response.data;
    }

    if (withKnownFields.cause !== undefined) {
      details.cause =
        withKnownFields.cause instanceof Error
          ? {
              name: withKnownFields.cause.name,
              message: withKnownFields.cause.message,
            }
          : withKnownFields.cause;
    }

    return details;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    return {
      ...candidate,
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'unknown worker error',
    };
  }

  return {
    value: String(error),
  };
}

function createErrorSummary(error: unknown): string {
  if (error instanceof SyncJobProcessingError) {
    const connectionPart = error.context.effectiveConnectionId
      ? `connection=${error.context.effectiveConnectionId}`
      : 'connection=unknown';

    return `stage=${error.context.stage}; ${connectionPart}; message=${error.message}`;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }

  return String(error);
}

export async function handleSyncJobMessage(
  message: ConsumeMessage,
  channel: Channel,
  pool: Pool,
  logger: Logger,
  config: WorkerConfig,
): Promise<void> {
  let parsedMessage: SyncJobMessage;

  try {
    const decoded = JSON.parse(message.content.toString('utf-8')) as unknown;
    parsedMessage = SyncJobMessageSchema.parse(decoded);
  } catch (error) {
    logger.error(
      {
        error: serializeError(error),
        rawMessage: message.content.toString('utf-8'),
      },
      'Invalid sync message payload, dead-lettering',
    );
    channel.nack(message, false, false);
    return;
  }

  try {
    await markJobRunning(pool, parsedMessage.jobId);
    await processSyncJob(parsedMessage, pool, config, logger);
    await markJobSucceeded(pool, parsedMessage.jobId);
    channel.ack(message);
  } catch (error) {
    const reason = extractErrorMessage(error);
    await markJobFailed(pool, parsedMessage.jobId, reason);

    const processingError = error instanceof SyncJobProcessingError ? error : null;
    logger.error(
      {
        error: serializeError(error),
        errorSummary: createErrorSummary(error),
        stage: processingError?.context.stage ?? null,
        provider: processingError?.context.provider ?? null,
        effectiveConnectionId: processingError?.context.effectiveConnectionId ?? null,
        jobId: parsedMessage.jobId,
        connectionId: parsedMessage.connectionId,
        requestedBy: parsedMessage.requestedBy,
        trigger: parsedMessage.trigger,
        formId: parsedMessage.formId ?? null,
        forceFullSync: parsedMessage.forceFullSync,
      },
      'Sync job failed',
    );
    channel.nack(message, false, false);
  }
}

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { SyncJobMessage } from '@survey-service/messaging';
import type { Metrics } from '../../infra/metrics';
import { NotFoundError, ValidationError } from '../../server/errors';
import type { JobTrigger, JobsRepository, SyncJobRecord } from './jobs.repository';
import type { JobsSyncTargetQueryService } from './jobs-sync-target.query-service';

export interface EnqueueSyncCommandInput {
  requestedBy: string;
  connectionId?: string;
  formId?: string;
  trigger: JobTrigger;
  forceFullSync: boolean;
  requestId?: string;
}

export interface JobsCommandService {
  enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord>;
}

const noopLogger = {
  info: () => {},
} as unknown as Logger;

export function createJobsCommandService(deps: {
  repository: JobsRepository;
  syncTargetQuery: JobsSyncTargetQueryService;
  logger?: Logger;
  metrics?: Metrics;
}): JobsCommandService {
  const logger = deps.logger ?? noopLogger;

  return {
    async enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord> {
      const startedAt = process.hrtime.bigint();
      const target = input.formId ? 'form' : 'connection';

      logger.info(
        {
          requestId: input.requestId,
          userId: input.requestedBy,
          trigger: input.trigger,
          target,
          formId: input.formId,
          connectionId: input.connectionId,
        },
        'Sync enqueue command received',
      );

      const targetForm = input.formId
        ? await deps.syncTargetQuery.resolveOwnedFormForSync(input.formId, input.requestedBy)
        : null;

      if (input.formId && !targetForm) {
        throw new NotFoundError('Form');
      }

      if (input.formId && input.connectionId && input.connectionId !== targetForm!.connectionId) {
        throw new ValidationError('Form does not belong to the requested connection', [
          {
            field: 'connectionId',
            message: 'The provided connectionId does not match the form connection',
            code: 'mismatch',
          },
        ]);
      }

      let effectiveConnectionId = targetForm?.connectionId ?? input.connectionId;
      if (!effectiveConnectionId) {
        throw new ValidationError('connectionId is required when formId is not provided', [
          {
            field: 'connectionId',
            message: 'Provide connectionId or formId',
            code: 'required',
          },
        ]);
      }

      if (!targetForm) {
        const targetConnection = await deps.syncTargetQuery.resolveOwnedConnectionForSync(
          effectiveConnectionId,
          input.requestedBy,
        );

        if (!targetConnection) {
          throw new NotFoundError('Connection');
        }

        effectiveConnectionId = targetConnection.id;
      }

      const jobId = randomUUID();
      const effectiveFormId = targetForm?.id ?? input.formId;
      const outboxMessage: SyncJobMessage = {
        jobId,
        connectionId: effectiveConnectionId,
        formId: effectiveFormId,
        requestedBy: input.requestedBy,
        trigger: input.trigger,
        forceFullSync: input.forceFullSync,
        timestamp: Date.now(),
        retryCount: 0,
      };

      const createdJob = await deps.repository.createSyncJob({
        id: jobId,
        requestedBy: input.requestedBy,
        connectionId: effectiveConnectionId,
        formId: effectiveFormId ?? null,
        trigger: input.trigger,
        outboxMessage,
      });

      const latencySeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      deps.metrics?.syncEnqueueDuration.labels(input.trigger, target).observe(latencySeconds);

      logger.info(
        {
          requestId: input.requestId,
          userId: input.requestedBy,
          jobId: createdJob.id,
          connectionId: createdJob.connectionId,
          formId: createdJob.formId,
          enqueueLatencyMs: Math.round(latencySeconds * 1000),
        },
        'Sync enqueue command persisted',
      );

      return createdJob;
    },
  };
}

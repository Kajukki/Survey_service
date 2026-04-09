import { randomUUID } from 'node:crypto';
import type { SyncJobMessage } from '@survey-service/messaging';
import { NotFoundError, ValidationError } from '../../server/errors';
import type { JobTrigger, JobsRepository, SyncJobRecord } from './jobs.repository';
import type { JobsSyncTargetQueryService } from './jobs-sync-target.query-service';

export interface EnqueueSyncCommandInput {
  requestedBy: string;
  connectionId?: string;
  formId?: string;
  trigger: JobTrigger;
  forceFullSync: boolean;
}

export interface JobsCommandService {
  enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord>;
}

export function createJobsCommandService(deps: {
  repository: JobsRepository;
  syncTargetQuery: JobsSyncTargetQueryService;
  publishSyncJob: (message: SyncJobMessage) => Promise<void>;
}): JobsCommandService {
  return {
    async enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord> {
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

      const job = await deps.repository.createSyncJob({
        id: jobId,
        requestedBy: input.requestedBy,
        connectionId: effectiveConnectionId,
        formId: effectiveFormId ?? null,
        trigger: input.trigger,
      });

      await deps.publishSyncJob({
        jobId: job.id,
        connectionId: effectiveConnectionId,
        formId: effectiveFormId,
        requestedBy: input.requestedBy,
        trigger: input.trigger,
        forceFullSync: input.forceFullSync,
        timestamp: Date.now(),
        retryCount: 0,
      });

      return job;
    },
  };
}

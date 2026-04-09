import { randomUUID } from 'node:crypto';
import type { SyncJobMessage } from '@survey-service/messaging';
import type { JobTrigger, JobsRepository, SyncJobRecord } from './jobs.repository';

export interface EnqueueSyncCommandInput {
  requestedBy: string;
  connectionId: string;
  formId?: string;
  trigger: JobTrigger;
  forceFullSync: boolean;
}

export interface JobsCommandService {
  enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord>;
}

export function createJobsCommandService(deps: {
  repository: JobsRepository;
  publishSyncJob: (message: SyncJobMessage) => Promise<void>;
}): JobsCommandService {
  return {
    async enqueueSyncJob(input: EnqueueSyncCommandInput): Promise<SyncJobRecord> {
      const jobId = randomUUID();

      const job = await deps.repository.createSyncJob({
        id: jobId,
        requestedBy: input.requestedBy,
        connectionId: input.connectionId,
        formId: input.formId ?? null,
        trigger: input.trigger,
      });

      await deps.publishSyncJob({
        jobId: job.id,
        connectionId: input.connectionId,
        formId: input.formId,
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

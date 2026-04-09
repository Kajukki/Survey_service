import { randomUUID } from 'node:crypto';
import type { SyncJobMessage } from '@survey-service/messaging';
import {
  createJobsRepository,
  type JobsRepository,
  type SyncJobRecord,
  type JobTrigger,
} from './jobs.repository';

export type { JobsRepository, SyncJobRecord };

export interface EnqueueSyncJobInput {
  requestedBy: string;
  connectionId: string;
  formId?: string;
  trigger: JobTrigger;
  forceFullSync: boolean;
}

export interface JobsService {
  enqueueSyncJob(input: EnqueueSyncJobInput): Promise<SyncJobRecord>;
  listJobs(
    requestedBy: string,
    page: number,
    perPage: number,
  ): Promise<{ items: SyncJobRecord[]; total: number }>;
  getJobById(requestedBy: string, id: string): Promise<SyncJobRecord | null>;
}

export function createJobsService(deps: { repository: JobsRepository }): JobsService {
  return {
    async enqueueSyncJob(input: EnqueueSyncJobInput): Promise<SyncJobRecord> {
      const jobId = randomUUID();
      const outboxMessage: SyncJobMessage = {
        jobId,
        connectionId: input.connectionId,
        formId: input.formId,
        requestedBy: input.requestedBy,
        trigger: input.trigger,
        forceFullSync: input.forceFullSync,
        timestamp: Date.now(),
        retryCount: 0,
      };

      return deps.repository.createSyncJob({
        id: jobId,
        requestedBy: input.requestedBy,
        connectionId: input.connectionId,
        formId: input.formId ?? null,
        trigger: input.trigger,
        outboxMessage,
      });
    },

    async listJobs(
      requestedBy: string,
      page: number,
      perPage: number,
    ): Promise<{ items: SyncJobRecord[]; total: number }> {
      return deps.repository.listJobs(requestedBy, page, perPage);
    },

    async getJobById(requestedBy: string, id: string): Promise<SyncJobRecord | null> {
      return deps.repository.getJobById(requestedBy, id);
    },
  };
}

export { createJobsRepository };

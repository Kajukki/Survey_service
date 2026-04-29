import type { JobsRepository, SyncJobRecord } from './jobs.repository';

export interface JobsQueryService {
  listJobs(
    requestedBy: string,
    page: number,
    perPage: number,
  ): Promise<{ items: SyncJobRecord[]; total: number }>;
  getJobById(requestedBy: string, id: string): Promise<SyncJobRecord | null>;
}

export function createJobsQueryService(deps: { repository: JobsRepository }): JobsQueryService {
  return {
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

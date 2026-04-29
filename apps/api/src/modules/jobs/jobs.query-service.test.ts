import { describe, expect, it, vi } from 'vitest';
import { createJobsQueryService } from './jobs.query-service';
import type { JobsRepository, SyncJobRecord } from './jobs.repository';

function makeRepo(): JobsRepository {
  return {
    createSyncJob: vi.fn(),
    listJobs: vi.fn(),
    getJobById: vi.fn(),
  };
}

describe('createJobsQueryService', () => {
  it('lists jobs scoped to requester', async () => {
    const repository = makeRepo();

    const listResult = {
      items: [
        {
          id: 'job-1',
          type: 'sync',
          status: 'queued',
          requestedBy: 'user-one',
          connectionId: null,
          formId: null,
          trigger: 'manual',
          source: 'manual_sync',
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          error: null,
        } satisfies SyncJobRecord,
      ],
      total: 1,
    };

    vi.mocked(repository.listJobs).mockResolvedValue(listResult);

    const service = createJobsQueryService({ repository });
    const result = await service.listJobs('user-one', 1, 20);

    expect(repository.listJobs).toHaveBeenCalledWith('user-one', 1, 20);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns job by id scoped to requester', async () => {
    const repository = makeRepo();

    const job: SyncJobRecord = {
      id: 'job-2',
      type: 'sync',
      status: 'queued',
      requestedBy: 'user-one',
      connectionId: null,
      formId: null,
      trigger: 'manual',
      source: 'manual_sync',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    vi.mocked(repository.getJobById).mockResolvedValue(job);

    const service = createJobsQueryService({ repository });
    const result = await service.getJobById('user-one', 'job-2');

    expect(repository.getJobById).toHaveBeenCalledWith('user-one', 'job-2');
    expect(result).toEqual(job);
  });
});

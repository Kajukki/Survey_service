import { describe, expect, it, vi } from 'vitest';
import { createJobsService, type JobsRepository, type SyncJobRecord } from './jobs.service';

function makeRepo(): JobsRepository {
  return {
    createSyncJob: vi.fn(),
    listJobs: vi.fn(),
    getJobById: vi.fn(),
  };
}

describe('createJobsService', () => {
  it('creates a queued job and persists outbox message payload', async () => {
    const repository = makeRepo();

    const created: SyncJobRecord = {
      id: '8f0ef42e-84ea-4420-b784-194880c5bb8c',
      type: 'sync',
      status: 'queued',
      requestedBy: 'test-user',
      connectionId: '11111111-1111-1111-1111-111111111111',
      formId: null,
      trigger: 'manual',
      source: 'manual_sync',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    vi.mocked(repository.createSyncJob).mockResolvedValue(created);

    const service = createJobsService({
      repository,
    });

    const result = await service.enqueueSyncJob({
      requestedBy: 'test-user',
      connectionId: '11111111-1111-1111-1111-111111111111',
      formId: undefined,
      trigger: 'manual',
      forceFullSync: false,
    });

    expect(repository.createSyncJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repository.createSyncJob).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        connectionId: '11111111-1111-1111-1111-111111111111',
        outboxMessage: expect.objectContaining({
          connectionId: '11111111-1111-1111-1111-111111111111',
          requestedBy: 'test-user',
        }),
      }),
    );
    expect(result.id).toBe(created.id);
    expect(result.status).toBe('queued');
  });

  it('reads a job only within the requester scope', async () => {
    const repository = makeRepo();

    const scopedJob: SyncJobRecord = {
      id: '8f0ef42e-84ea-4420-b784-194880c5bb8c',
      type: 'sync',
      status: 'queued',
      requestedBy: 'owner-user',
      connectionId: null,
      formId: null,
      trigger: 'manual',
      source: 'manual_sync',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    vi.mocked(repository.getJobById).mockResolvedValue(scopedJob);

    const service = createJobsService({
      repository,
    });

    const result = await service.getJobById('owner-user', scopedJob.id);

    expect(repository.getJobById).toHaveBeenCalledWith('owner-user', scopedJob.id);
    expect(result).toEqual(scopedJob);
  });

  it('returns null when job is outside requester scope', async () => {
    const repository = makeRepo();

    vi.mocked(repository.getJobById).mockResolvedValue(null);

    const service = createJobsService({
      repository,
    });

    const result = await service.getJobById('other-user', '8f0ef42e-84ea-4420-b784-194880c5bb8c');

    expect(repository.getJobById).toHaveBeenCalledWith(
      'other-user',
      '8f0ef42e-84ea-4420-b784-194880c5bb8c',
    );
    expect(result).toBeNull();
  });
});

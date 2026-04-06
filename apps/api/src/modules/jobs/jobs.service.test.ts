import { describe, expect, it, vi } from 'vitest';
import type { SyncJobMessage } from '@survey-service/messaging';
import { createJobsService, type JobsRepository, type SyncJobRecord } from './jobs.service';

function makeRepo(): JobsRepository {
  return {
    createSyncJob: vi.fn(),
    listJobs: vi.fn(),
    getJobById: vi.fn(),
  };
}

describe('createJobsService', () => {
  it('creates a queued job and publishes a sync message with the same job id', async () => {
    const repository = makeRepo();
    const publishSyncJob = vi.fn(async (_message: SyncJobMessage) => {});

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
      publishSyncJob,
    });

    const result = await service.enqueueSyncJob({
      requestedBy: 'test-user',
      connectionId: '11111111-1111-1111-1111-111111111111',
      formId: undefined,
      trigger: 'manual',
      forceFullSync: false,
    });

    expect(repository.createSyncJob).toHaveBeenCalledTimes(1);
    expect(publishSyncJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishSyncJob).mock.calls[0]?.[0].jobId).toBe(created.id);
    expect(result.id).toBe(created.id);
    expect(result.status).toBe('queued');
  });

  it('does not swallow publish errors', async () => {
    const repository = makeRepo();
    const publishSyncJob = vi.fn(async () => {
      throw new Error('publish failed');
    });

    vi.mocked(repository.createSyncJob).mockResolvedValue({
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
    });

    const service = createJobsService({
      repository,
      publishSyncJob,
    });

    await expect(
      service.enqueueSyncJob({
        requestedBy: 'test-user',
        connectionId: '11111111-1111-1111-1111-111111111111',
        formId: undefined,
        trigger: 'manual',
        forceFullSync: false,
      }),
    ).rejects.toThrow('publish failed');
  });
});

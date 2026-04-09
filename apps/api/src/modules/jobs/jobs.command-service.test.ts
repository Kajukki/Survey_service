import { describe, expect, it, vi } from 'vitest';
import type { SyncJobMessage } from '@survey-service/messaging';
import { NotFoundError, ValidationError } from '../../server/errors';
import { createJobsCommandService } from './jobs.command-service';
import type { JobsRepository, SyncJobRecord } from './jobs.repository';
import type { JobsSyncTargetQueryService } from './jobs-sync-target.query-service';

function makeRepo(): JobsRepository {
  return {
    createSyncJob: vi.fn(),
    listJobs: vi.fn(),
    getJobById: vi.fn(),
  };
}

function makeSyncTargetQuery(): JobsSyncTargetQueryService {
  return {
    resolveOwnedFormForSync: vi.fn(),
    resolveOwnedConnectionForSync: vi.fn(),
  };
}

function makeCreatedJob(): SyncJobRecord {
  return {
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
}

describe('createJobsCommandService', () => {
  it('enqueues with connection ownership validation when formId is not provided', async () => {
    const repository = makeRepo();
    const syncTargetQuery = makeSyncTargetQuery();
    const publishSyncJob = vi.fn(async (_message: SyncJobMessage) => {});

    vi.mocked(syncTargetQuery.resolveOwnedConnectionForSync).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      ownerId: 'test-user',
    });

    const created = makeCreatedJob();
    vi.mocked(repository.createSyncJob).mockResolvedValue(created);

    const service = createJobsCommandService({
      repository,
      syncTargetQuery,
      publishSyncJob,
    });

    const result = await service.enqueueSyncJob({
      requestedBy: 'test-user',
      connectionId: '11111111-1111-1111-1111-111111111111',
      trigger: 'manual',
      forceFullSync: false,
    });

    expect(syncTargetQuery.resolveOwnedConnectionForSync).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'test-user',
    );
    expect(repository.createSyncJob).toHaveBeenCalledTimes(1);
    expect(publishSyncJob).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(created.id);
  });

  it('derives connection from owned form when formId is provided', async () => {
    const repository = makeRepo();
    const syncTargetQuery = makeSyncTargetQuery();
    const publishSyncJob = vi.fn(async (_message: SyncJobMessage) => {});

    vi.mocked(syncTargetQuery.resolveOwnedFormForSync).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      connectionId: '11111111-1111-1111-1111-111111111111',
      ownerId: 'test-user',
    });

    const created = {
      ...makeCreatedJob(),
      formId: '22222222-2222-2222-2222-222222222222',
    };
    vi.mocked(repository.createSyncJob).mockResolvedValue(created);

    const service = createJobsCommandService({
      repository,
      syncTargetQuery,
      publishSyncJob,
    });

    await service.enqueueSyncJob({
      requestedBy: 'test-user',
      formId: '22222222-2222-2222-2222-222222222222',
      trigger: 'manual',
      forceFullSync: false,
    });

    expect(syncTargetQuery.resolveOwnedFormForSync).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
      'test-user',
    );
    expect(syncTargetQuery.resolveOwnedConnectionForSync).not.toHaveBeenCalled();
    expect(repository.createSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: '11111111-1111-1111-1111-111111111111',
        formId: '22222222-2222-2222-2222-222222222222',
      }),
    );
  });

  it('throws not found when form is not owned by requester', async () => {
    const repository = makeRepo();
    const syncTargetQuery = makeSyncTargetQuery();

    vi.mocked(syncTargetQuery.resolveOwnedFormForSync).mockResolvedValue(null);

    const service = createJobsCommandService({
      repository,
      syncTargetQuery,
      publishSyncJob: vi.fn(async (_message: SyncJobMessage) => {}),
    });

    await expect(
      service.enqueueSyncJob({
        requestedBy: 'test-user',
        formId: '22222222-2222-2222-2222-222222222222',
        trigger: 'manual',
        forceFullSync: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws validation error when form/connection mismatch is supplied', async () => {
    const repository = makeRepo();
    const syncTargetQuery = makeSyncTargetQuery();

    vi.mocked(syncTargetQuery.resolveOwnedFormForSync).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      connectionId: '11111111-1111-1111-1111-111111111111',
      ownerId: 'test-user',
    });

    const service = createJobsCommandService({
      repository,
      syncTargetQuery,
      publishSyncJob: vi.fn(async (_message: SyncJobMessage) => {}),
    });

    await expect(
      service.enqueueSyncJob({
        requestedBy: 'test-user',
        connectionId: '33333333-3333-3333-3333-333333333333',
        formId: '22222222-2222-2222-2222-222222222222',
        trigger: 'manual',
        forceFullSync: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

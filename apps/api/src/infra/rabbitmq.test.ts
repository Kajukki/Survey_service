import { describe, expect, it, vi } from 'vitest';
import type { ConfirmChannel } from 'amqplib';
import { publishSyncJobMessage } from './rabbitmq';

describe('publishSyncJobMessage', () => {
  it('throws when payload is invalid', async () => {
    const channel = {
      publish: vi.fn(),
      waitForConfirms: vi.fn(async () => {}),
    } as unknown as ConfirmChannel;

    await expect(
      publishSyncJobMessage(channel, {
        jobId: 'not-a-uuid',
        connectionId: 'also-not-a-uuid',
        requestedBy: '',
        trigger: 'manual',
        timestamp: Date.now(),
      } as any),
    ).rejects.toThrow();

    expect(vi.mocked(channel.publish)).not.toHaveBeenCalled();
  });

  it('publishes and waits for confirms when payload is valid', async () => {
    const channel = {
      publish: vi.fn(() => true),
      waitForConfirms: vi.fn(async () => {}),
    } as unknown as ConfirmChannel;

    await publishSyncJobMessage(channel, {
      jobId: '8f0ef42e-84ea-4420-b784-194880c5bb8c',
      connectionId: '11111111-1111-4111-8111-111111111111',
      requestedBy: 'test-user',
      trigger: 'manual',
      forceFullSync: false,
      timestamp: Date.now(),
      retryCount: 0,
    });

    expect(vi.mocked(channel.publish)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(channel.waitForConfirms)).toHaveBeenCalledTimes(1);
  });
});

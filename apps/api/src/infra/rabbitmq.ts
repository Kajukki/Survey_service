/**
 * RabbitMQ infrastructure: connection and channel management.
 */
import amqplib, { ChannelModel, ConfirmChannel } from 'amqplib';
import type { Logger } from 'pino';
import {
  BINDINGS,
  EXCHANGES,
  PUBLISHER_OPTIONS,
  QUEUES,
  QUEUE_CONFIG,
  ROUTING_KEYS,
  SyncJobMessageSchema,
  type SyncJobMessage,
} from '@survey-service/messaging';
import type { Config } from '../server/config';
import { AppError, ErrorCode } from '../server/errors';

type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export class RabbitMQPublishError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.SERVICE_UNAVAILABLE, 503, message, details);
    this.name = 'RabbitMQPublishError';
  }
}

/**
 * RabbitMQ connection and channel wrapper.
 */
export interface RabbitMQClient {
  connection: ChannelModel;
  channel: ConfirmChannel;
  isConnected(): boolean;
  assertTopology(): Promise<void>;
  publishSyncJob(message: SyncJobMessage): Promise<void>;
  close(): Promise<void>;
}

export async function assertMessagingTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(EXCHANGES.SYNC, 'topic', { durable: true });
  await channel.assertExchange(EXCHANGES.ANALYSIS, 'topic', { durable: true });
  await channel.assertExchange(EXCHANGES.DLX, 'topic', { durable: true });

  const queueConfigEntries = Object.entries(QUEUE_CONFIG) as Array<
    [QueueName, { durable: boolean; arguments?: Record<string, unknown> }]
  >;

  for (const [queueName, queueConfig] of queueConfigEntries) {
    await channel.assertQueue(queueName, queueConfig);
  }

  await channel.bindQueue(QUEUES.DLQ, EXCHANGES.DLX, '#');

  for (const binding of BINDINGS) {
    await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
  }
}

export async function publishSyncJobMessage(
  channel: ConfirmChannel,
  message: SyncJobMessage,
): Promise<void> {
  const payload = SyncJobMessageSchema.parse(message);

  const published = channel.publish(
    EXCHANGES.SYNC,
    ROUTING_KEYS.SYNC_CONNECTION,
    Buffer.from(JSON.stringify(payload)),
    PUBLISHER_OPTIONS,
  );

  if (!published) {
    throw new RabbitMQPublishError('RabbitMQ backpressure prevented publish');
  }

  await channel.waitForConfirms();
}

/**
 * Create RabbitMQ connection and channel with publisher confirms enabled.
 */
export async function createRabbitMQClient(
  config: Config,
  logger: Logger,
): Promise<RabbitMQClient> {
  let connected = false;

  if (process.env.MOCK_INFRA === 'true') {
    logger.warn('MOCK_INFRA is set, bypassing RabbitMQ connection');
    return {
      connection: {} as ChannelModel,
      channel: {} as ConfirmChannel,
      isConnected: () => true,
      assertTopology: async () => {},
      publishSyncJob: async () => {},
      close: async () => {},
    };
  }

  try {
    const connection = await amqplib.connect(config.RABBITMQ_URL, {
      connectionTimeout: 10000,
      frameMax: 0x1000,
    });
    connected = true;

    connection.on('error', (err) => {
      connected = false;
      logger.error({ err }, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      connected = false;
      logger.warn('RabbitMQ connection closed');
    });

    const channel = await connection.createConfirmChannel();

    // Apply prefetch limit per consumer
    await channel.prefetch(config.RABBITMQ_PREFETCH);

    await assertMessagingTopology(channel);

    logger.info(
      {
        prefetch: config.RABBITMQ_PREFETCH,
      },
      'RabbitMQ channel initialized',
    );

    return {
      connection,
      channel,
      isConnected: () => connected,
      assertTopology: async () => {
        await assertMessagingTopology(channel);
      },
      publishSyncJob: async (message: SyncJobMessage) => {
        try {
          await publishSyncJobMessage(channel, message);
        } catch (error) {
          logger.error({ error, message }, 'Failed to publish sync job message');
          throw new RabbitMQPublishError('Failed to publish sync job', {
            cause: error instanceof Error ? error.message : 'unknown',
          });
        }
      },
      close: async () => {
        await channel.close();
        await connection.close();
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to initialize RabbitMQ client');
    throw error;
  }
}

/**
 * RabbitMQ infrastructure: connection and channel management.
 */
import amqplib, { ChannelModel, ConfirmChannel } from 'amqplib';
import type { Logger } from 'pino';
import type { Config } from '../server/config';

/**
 * RabbitMQ connection and channel wrapper.
 */
export interface RabbitMQClient {
  connection: ChannelModel;
  channel: ConfirmChannel;
  isConnected(): boolean;
  close(): Promise<void>;
}

/**
 * Create RabbitMQ connection and channel with publisher confirms enabled.
 */
export async function createRabbitMQClient(
  config: Config,
  logger: Logger,
): Promise<RabbitMQClient> {
  if (process.env.MOCK_INFRA === 'true') {
    logger.warn('MOCK_INFRA is set, bypassing RabbitMQ connection');
    return {
      connection: {} as ChannelModel,
      channel: {} as ConfirmChannel,
      isConnected: () => true,
      close: async () => { },
    };
  }

  try {
    const connection = await amqplib.connect(config.RABBITMQ_URL, {
      connectionTimeout: 10000,
      frameMax: 0x1000,
    });

    connection.on('error', (err) => {
      logger.error({ err }, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
    });

    const channel = await connection.createConfirmChannel();

    // Apply prefetch limit per consumer
    await channel.prefetch(config.RABBITMQ_PREFETCH);

    logger.info(
      {
        prefetch: config.RABBITMQ_PREFETCH,
      },
      'RabbitMQ channel initialized',
    );

    return {
      connection,
      channel,
      isConnected: () => true,
      close: async () => {
        await connection.close();
        await channel.close();
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to initialize RabbitMQ client');
    throw error;
  }
}

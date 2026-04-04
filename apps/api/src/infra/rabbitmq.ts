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
      isConnected: () => !!connection /* simplistic check for now */,
      close: async () => {
        await channel.close();
        await connection.close();
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to connect to RabbitMQ');
    throw error;
  }
}

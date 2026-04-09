import type { Channel } from 'amqplib';
import { BINDINGS, EXCHANGES, QUEUES, QUEUE_CONFIG } from '@survey-service/messaging';

export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGES.SYNC, 'topic', { durable: true });
  await channel.assertExchange(EXCHANGES.ANALYSIS, 'topic', { durable: true });
  await channel.assertExchange(EXCHANGES.DLX, 'topic', { durable: true });

  for (const [queueName, queueConfig] of Object.entries(QUEUE_CONFIG)) {
    await channel.assertQueue(queueName, queueConfig);
  }

  await channel.bindQueue(QUEUES.DLQ, EXCHANGES.DLX, '#');

  for (const binding of BINDINGS) {
    await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
  }
}

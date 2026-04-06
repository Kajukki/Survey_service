import amqplib, { type Channel, type ConsumeMessage } from 'amqplib';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { pino, type Logger } from 'pino';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  BINDINGS,
  CONSUMER_PREFETCH,
  EXCHANGES,
  QUEUES,
  QUEUE_CONFIG,
  SyncJobMessageSchema,
  type SyncJobMessage,
} from '@survey-service/messaging';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(CONSUMER_PREFETCH),
});

type WorkerConfig = z.infer<typeof configSchema>;

export type WorkerState = {
  service: 'worker';
  status: 'ready' | 'running';
};

let currentState: WorkerState = {
  service: 'worker',
  status: 'ready',
};

export const getWorkerState = (): WorkerState => currentState;

function loadEnvironmentFiles(): void {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  const candidatePaths = [
    resolve(process.cwd(), '.env'),
    resolve(currentDir, '../.env'),
    resolve(currentDir, '../../../.env'),
  ];

  const uniquePaths = [...new Set(candidatePaths)];
  for (const envPath of uniquePaths) {
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath });
    }
  }
}

function loadConfig(): WorkerConfig {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const errorMessage = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Worker configuration error:\n${errorMessage}\n` +
        'Set required variables in process env or a .env file at apps/worker/.env or repository root .env',
    );
  }

  return parsed.data;
}

async function assertTopology(channel: Channel): Promise<void> {
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

async function markJobRunning(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `
      UPDATE jobs
      SET status = 'running',
          started_at = NOW(),
          error = NULL
      WHERE id = $1
    `,
    [jobId],
  );
}

async function markJobSucceeded(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `
      UPDATE jobs
      SET status = 'succeeded',
          completed_at = NOW(),
          error = NULL
      WHERE id = $1
    `,
    [jobId],
  );
}

async function markJobFailed(pool: Pool, jobId: string, errorMessage: string): Promise<void> {
  await pool.query(
    `
      UPDATE jobs
      SET status = 'failed',
          completed_at = NOW(),
          error = $2
      WHERE id = $1
    `,
    [jobId, errorMessage],
  );
}

async function processSyncJob(payload: SyncJobMessage): Promise<void> {
  // Provider sync logic will be added in connector-specific phases.
  // This keeps the queue lifecycle and status transitions fully testable.
  void payload;
}

async function handleMessage(
  message: ConsumeMessage,
  channel: Channel,
  pool: Pool,
  logger: Logger,
): Promise<void> {
  let parsedMessage: SyncJobMessage;

  try {
    const decoded = JSON.parse(message.content.toString('utf-8')) as unknown;
    parsedMessage = SyncJobMessageSchema.parse(decoded);
  } catch (error) {
    logger.error({ error }, 'Invalid sync message payload, dead-lettering');
    channel.nack(message, false, false);
    return;
  }

  try {
    await markJobRunning(pool, parsedMessage.jobId);
    await processSyncJob(parsedMessage);
    await markJobSucceeded(pool, parsedMessage.jobId);
    channel.ack(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown worker error';
    await markJobFailed(pool, parsedMessage.jobId, reason);
    logger.error({ error, jobId: parsedMessage.jobId }, 'Sync job failed');
    channel.nack(message, false, false);
  }
}

async function main(): Promise<void> {
  loadEnvironmentFiles();
  const config = loadConfig();
  const logger = pino({
    level: config.LOG_LEVEL,
  });

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    min: 1,
  });

  const connection = await amqplib.connect(config.RABBITMQ_URL, {
    connectionTimeout: 10000,
  });
  const channel = await connection.createChannel();

  await assertTopology(channel);
  await channel.prefetch(config.RABBITMQ_PREFETCH);

  currentState = {
    service: 'worker',
    status: 'running',
  };

  const consumer = await channel.consume(QUEUES.SYNC_JOBS, async (message) => {
    if (!message) {
      return;
    }

    await handleMessage(message, channel, pool, logger);
  });

  logger.info(
    {
      queue: QUEUES.SYNC_JOBS,
      prefetch: config.RABBITMQ_PREFETCH,
      consumerTag: consumer.consumerTag,
    },
    'Worker started',
  );

  const shutdown = async () => {
    currentState = {
      service: 'worker',
      status: 'ready',
    };

    try {
      await channel.cancel(consumer.consumerTag);
      await channel.close();
      await connection.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Worker shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});

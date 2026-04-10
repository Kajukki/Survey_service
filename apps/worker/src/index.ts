import amqplib from 'amqplib';
import { pino, type Logger } from 'pino';
import { Pool } from 'pg';
import { QUEUES } from '@survey-service/messaging';
import { loadConfig, loadEnvironmentFiles } from './config.js';
import {
  beginExportTransaction,
  commitExportTransaction,
  loadQueuedExportJobs,
  markExportJobFailed,
  markExportJobReady,
  rollbackExportTransaction,
  type ExportJobRow,
} from './db/exports.js';
import { extractErrorMessage } from './sync/processor.js';
import { handleSyncJobMessage, serializeError } from './messaging/handler.js';
import { assertTopology } from './messaging/topology.js';
import { shouldRunExport, shouldRunSync } from './runtime/roles.js';
import { getWorkerState, setWorkerState, type WorkerState } from './state.js';

export { getWorkerState };
export type { WorkerState };

function getExportFileExtension(format: ExportJobRow['format']): string {
  if (format === 'excel') {
    return 'xlsx';
  }

  return format;
}

function buildExportDownloadUrl(exportId: string, format: ExportJobRow['format']): string {
  const extension = getExportFileExtension(format);
  return `https://example.com/downloads/${exportId}.${extension}`;
}

async function processQueuedExportJobs(pool: Pool, logger: Logger): Promise<number> {
  const client = await beginExportTransaction(pool);
  try {
    const queued = await loadQueuedExportJobs(client);

    for (const job of queued) {
      try {
        const downloadUrl = buildExportDownloadUrl(job.id, job.format);
        await markExportJobReady(client, job.id, downloadUrl);
      } catch (error) {
        await markExportJobFailed(client, job.id, extractErrorMessage(error));
      }
    }

    await commitExportTransaction(client);

    const processedCount = queued.length;
    if (processedCount > 0) {
      logger.info({ processedExports: processedCount }, 'Processed queued export jobs');
    }

    return processedCount;
  } catch (error) {
    await rollbackExportTransaction(client);
    logger.error({ error: serializeError(error) }, 'Failed processing queued export jobs');
    return 0;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  loadEnvironmentFiles();
  const config = loadConfig();
  const runSyncRole = shouldRunSync(config.WORKER_ROLE);
  const runExportRole = shouldRunExport(config.WORKER_ROLE);
  const logger = pino({
    level: config.LOG_LEVEL,
  });

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    min: 1,
  });

  let connection: amqplib.ChannelModel | null = null;
  let channel: amqplib.Channel | null = null;
  let consumerTag: string | null = null;
  let exportInterval: NodeJS.Timeout | null = null;

  if (runSyncRole) {
    connection = await amqplib.connect(config.RABBITMQ_URL, {
      connectionTimeout: 10000,
    });
    channel = await connection.createChannel();

    await assertTopology(channel);
    await channel.prefetch(config.RABBITMQ_PREFETCH);
  }

  setWorkerState({
    service: 'worker',
    status: 'running',
  });

  let exportLifecycleRunning = false;
  const runExportLifecycleTick = async () => {
    if (exportLifecycleRunning) {
      return;
    }

    exportLifecycleRunning = true;
    try {
      await processQueuedExportJobs(pool, logger);
    } finally {
      exportLifecycleRunning = false;
    }
  };

  if (runExportRole) {
    await runExportLifecycleTick();
    exportInterval = setInterval(() => {
      void runExportLifecycleTick();
    }, config.EXPORT_POLL_INTERVAL_MS);
  }

  if (runSyncRole && channel) {
    const consumer = await channel.consume(QUEUES.SYNC_JOBS, async (message) => {
      if (!message) {
        return;
      }

      await handleSyncJobMessage(message, channel!, pool, logger, config);
    });
    consumerTag = consumer.consumerTag;
  }

  logger.info(
    {
      workerRole: config.WORKER_ROLE,
      runSyncRole,
      runExportRole,
      queue: runSyncRole ? QUEUES.SYNC_JOBS : null,
      prefetch: config.RABBITMQ_PREFETCH,
      consumerTag,
      exportPollIntervalMs: runExportRole ? config.EXPORT_POLL_INTERVAL_MS : null,
    },
    'Worker started',
  );

  const shutdown = async () => {
    setWorkerState({
      service: 'worker',
      status: 'ready',
    });

    try {
      if (exportInterval) {
        clearInterval(exportInterval);
      }

      if (channel && consumerTag) {
        await channel.cancel(consumerTag);
      }

      if (channel) {
        await channel.close();
      }

      if (connection) {
        await connection.close();
      }

      await pool.end();
      process.exit(0);
    } catch (error) {
      logger.error({ error: serializeError(error) }, 'Worker shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Worker failed to start', serializeError(error));
  process.exit(1);
});

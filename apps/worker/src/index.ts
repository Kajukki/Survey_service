import amqplib, { type Channel, type ConsumeMessage } from 'amqplib';
import { pino, type Logger } from 'pino';
import { Pool } from 'pg';
import {
  GoogleFormsConnector,
  type ConnectorHttpClient,
} from '@survey-service/connectors';
import {
  QUEUES,
  SyncJobMessageSchema,
  type SyncJobMessage,
} from '@survey-service/messaging';
import { loadConfig, loadEnvironmentFiles, type WorkerConfig } from './config.js';
import {
  buildAnalyticsSnapshot,
  type SyncedResponse,
} from './analytics/snapshot.js';
import {
  buildPersistedFormSchema,
  buildQuestionLookup,
  type QuestionLookup,
} from './analytics/schema.js';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  isTokenExpiringSoon,
} from './crypto/credentials.js';
import {
  loadProviderConnection,
  persistRefreshedProviderToken,
} from './db/connections.js';
import {
  beginExportTransaction,
  commitExportTransaction,
  loadQueuedExportJobs,
  markExportJobFailed,
  markExportJobReady,
  rollbackExportTransaction,
  type ExportJobRow,
} from './db/exports.js';
import {
  refreshFormResponseCount,
  upsertAnalyticsSnapshot,
  upsertForm,
  upsertFormResponse,
} from './db/forms.js';
import { markJobFailed, markJobRunning, markJobSucceeded } from './db/jobs.js';
import { assertTopology } from './messaging/topology.js';
import { getWorkerState, setWorkerState, type WorkerState } from './state.js';
import { listAllProviderForms } from './sync-utils.js';

export { getWorkerState };
export type { WorkerState };

interface SyncJobProcessingContext {
  stage:
    | 'load-connection'
    | 'validate-provider'
    | 'decrypt-credentials'
    | 'refresh-token'
    | 'persist-refreshed-token'
    | 'list-forms'
    | 'fetch-form-definition'
    | 'persist-forms'
    | 'list-responses'
    | 'persist-responses'
    | 'persist-analytics';
  effectiveConnectionId?: string;
  provider?: 'google' | 'microsoft';
}

class SyncJobProcessingError extends Error {
  constructor(
    message: string,
    readonly context: SyncJobProcessingContext,
    readonly causeError: unknown,
  ) {
    super(message);
    this.name = 'SyncJobProcessingError';
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message;
    }
  }

  return 'unknown worker error';
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof SyncJobProcessingError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context: error.context,
      cause: serializeError(error.causeError),
    };
  }

  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const withKnownFields = error as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
      response?: {
        status?: number;
        data?: unknown;
      };
      cause?: unknown;
    };

    if (withKnownFields.code) {
      details.code = withKnownFields.code;
    }

    if (withKnownFields.status !== undefined) {
      details.status = withKnownFields.status;
    }

    if (withKnownFields.statusCode !== undefined) {
      details.statusCode = withKnownFields.statusCode;
    }

    if (withKnownFields.response?.status !== undefined) {
      details.responseStatus = withKnownFields.response.status;
    }

    if (withKnownFields.response?.data !== undefined) {
      details.responseData = withKnownFields.response.data;
    }

    if (withKnownFields.cause !== undefined) {
      details.cause =
        withKnownFields.cause instanceof Error
          ? {
              name: withKnownFields.cause.name,
              message: withKnownFields.cause.message,
            }
          : withKnownFields.cause;
    }

    return details;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    return {
      ...candidate,
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'unknown worker error',
    };
  }

  return {
    value: String(error),
  };
}

function createErrorSummary(error: unknown): string {
  if (error instanceof SyncJobProcessingError) {
    const connectionPart = error.context.effectiveConnectionId
      ? `connection=${error.context.effectiveConnectionId}`
      : 'connection=unknown';

    return `stage=${error.context.stage}; ${connectionPart}; message=${error.message}`;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }

  return String(error);
}

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

function createFetchHttpClient(timeoutMs: number = 10_000): ConnectorHttpClient {
  return {
    async request<T>(input: {
      method: 'GET' | 'POST';
      url: string;
      headers?: Record<string, string>;
      query?: Record<string, string | undefined>;
      body?: unknown;
    }) {
      const url = new URL(input.url);

      if (input.query) {
        for (const [key, value] of Object.entries(input.query)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: input.method,
          headers: input.headers,
          body: input.body ? JSON.stringify(input.body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const rawBody = await response.text().catch(() => '');
          const contentType = response.headers.get('content-type') ?? '';
          const body = (() => {
            if (!rawBody) {
              return undefined;
            }

            if (contentType.includes('application/json')) {
              try {
                return JSON.parse(rawBody) as unknown;
              } catch {
                return rawBody;
              }
            }

            return rawBody;
          })();

          const bodyPreview =
            typeof body === 'string'
              ? body.slice(0, 1000)
              : body
                ? JSON.stringify(body).slice(0, 1000)
                : undefined;

          const responseHeaders = {
            'content-type': response.headers.get('content-type'),
            'www-authenticate': response.headers.get('www-authenticate'),
            'x-goog-request-id': response.headers.get('x-goog-request-id'),
          };

          throw {
            message: `Google API request failed with status ${response.status} for ${input.method} ${url.toString()}${bodyPreview ? ` | body: ${bodyPreview}` : ''}`,
            response: {
              status: response.status,
              data: body,
              headers: responseHeaders,
            },
          };
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function toPreviewString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toPreviewString(item))
      .filter((item) => item.length > 0)
      .join(', ');
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const choiceAnswers = candidate.choiceAnswers as { answers?: unknown[] } | undefined;
    if (choiceAnswers?.answers && Array.isArray(choiceAnswers.answers)) {
      return choiceAnswers.answers.map((item) => toPreviewString(item)).join(', ');
    }

    const textAnswers = candidate.textAnswers as
      | { answers?: Array<{ value?: string }> }
      | undefined;
    if (textAnswers?.answers && Array.isArray(textAnswers.answers)) {
      return textAnswers.answers
        .map((item) => (typeof item?.value === 'string' ? item.value : ''))
        .filter((item) => item.length > 0)
        .join(' | ');
    }

    try {
      return JSON.stringify(candidate);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}

function buildAnswerPreview(answers: Record<string, unknown>, questionLookup: QuestionLookup) {
  return Object.entries(answers)
    .map(([questionId, rawValue]) => {
      const question = questionLookup.get(questionId);
      const preview = toPreviewString(rawValue).trim();
      return {
        questionId,
        questionLabel: question?.label ?? questionId,
        questionType: question?.type ?? 'text',
        valuePreview: preview.length > 0 ? preview.slice(0, 160) : '(no answer)',
      };
    })
    .slice(0, 8);
}

function resolveCompletion(answers: Record<string, unknown>): 'completed' | 'partial' {
  return Object.keys(answers).length > 0 ? 'completed' : 'partial';
}

async function processSyncJob(
  payload: SyncJobMessage,
  pool: Pool,
  config: WorkerConfig,
  logger: Logger,
): Promise<void> {
  let stage: SyncJobProcessingContext['stage'] = 'load-connection';
  let effectiveConnectionId: string | undefined;
  let provider: SyncJobProcessingContext['provider'];

  try {
    const connection = await loadProviderConnection(pool, payload.connectionId, payload.requestedBy);
    if (!connection) {
      throw new Error('Provider connection not found for sync job and requester');
    }

    effectiveConnectionId = connection.id;
    provider = connection.provider;

    stage = 'validate-provider';
    if (connection.provider !== 'google') {
      throw new Error(`Provider ${connection.provider} is not supported by this worker slice`);
    }

    const connector = new GoogleFormsConnector(
      {
        clientId: config.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
        authBaseUrl: config.GOOGLE_OAUTH_AUTH_BASE_URL,
        tokenUrl: config.GOOGLE_OAUTH_TOKEN_URL,
        formsApiBaseUrl: config.GOOGLE_FORMS_API_BASE_URL,
      },
      createFetchHttpClient(),
    );

    stage = 'decrypt-credentials';
    const decrypted = decryptCredentialPayload(config, connection);
    let tokenSet = decrypted.tokenSet;

    if (isTokenExpiringSoon(tokenSet.expiresAt)) {
      if (!tokenSet.refreshToken) {
        throw new Error('Google access token is expired and no refresh token is available');
      }

      stage = 'refresh-token';
      const refreshedTokenSet = await connector.refreshAccessToken({
        refreshToken: tokenSet.refreshToken,
      });

      tokenSet = {
        accessToken: refreshedTokenSet.accessToken,
        refreshToken: refreshedTokenSet.refreshToken,
        expiresAt: refreshedTokenSet.expiresAt,
        scope: refreshedTokenSet.scope,
        tokenType: refreshedTokenSet.tokenType,
      };

      const encrypted = encryptCredentialPayload(config, {
        tokenSet,
        idToken: decrypted.idToken,
      });

      stage = 'persist-refreshed-token';
      await persistRefreshedProviderToken(pool, {
        connectionId: connection.id,
        encryptedTokenPayload: encrypted.encryptedTokenPayload,
        encryptedTokenIv: encrypted.encryptedTokenIv,
        encryptedTokenTag: encrypted.encryptedTokenTag,
        encryptedTokenKeyVersion: encrypted.encryptedTokenKeyVersion,
        expiresAt: tokenSet.expiresAt,
        scope: tokenSet.scope ?? null,
        tokenType: tokenSet.tokenType ?? 'Bearer',
      });
    }

    stage = 'list-forms';
    const formsResult = await listAllProviderForms(connector, tokenSet.accessToken);

    stage = 'persist-forms';
    for (const form of formsResult.items) {
      stage = 'fetch-form-definition';
      const formDefinition = await connector.getFormDefinition({
        accessToken: tokenSet.accessToken,
        externalFormId: form.externalFormId,
      });
      const persistedSchema = buildPersistedFormSchema(formDefinition);
      const questionLookup = buildQuestionLookup(persistedSchema);

      stage = 'persist-forms';
      const persistedFormId = await upsertForm(pool, {
        ownerId: connection.owner_id,
        connectionId: connection.id,
        externalFormId: form.externalFormId,
        title: formDefinition.title,
        description: formDefinition.description ?? null,
        persistedSchema,
        responseCount: form.responseCount,
      });
      if (!persistedFormId) {
        continue;
      }

      const syncedResponses: SyncedResponse[] = [];

      stage = 'list-responses';
      let nextPageToken: string | undefined;
      let pageCount = 0;

      do {
        const responsePage = await connector.listFormResponses({
          accessToken: tokenSet.accessToken,
          externalFormId: form.externalFormId,
          pageToken: nextPageToken,
        });

        stage = 'persist-responses';
        for (const response of responsePage.responses) {
          const answers = response.answers ?? {};
          const answerPreview = buildAnswerPreview(answers, questionLookup);
          syncedResponses.push({
            submittedAt: response.submittedAt,
            completion: resolveCompletion(answers),
            answers,
          });

          await upsertFormResponse(pool, {
            ownerId: connection.owner_id,
            formId: persistedFormId,
            externalResponseId: response.externalResponseId,
            submittedAt: response.submittedAt ?? null,
            completion: resolveCompletion(answers),
            answers,
            answerPreview,
          });
        }

        nextPageToken = responsePage.nextPageToken;
        pageCount += 1;
      } while (nextPageToken && pageCount < 50);

      await refreshFormResponseCount(pool, persistedFormId);

      stage = 'persist-analytics';
      const analyticsSnapshot = buildAnalyticsSnapshot(persistedSchema, syncedResponses);
      await upsertAnalyticsSnapshot(pool, connection.owner_id, persistedFormId, analyticsSnapshot);
    }

    logger.info(
      {
        jobId: payload.jobId,
        connectionId: payload.connectionId,
        effectiveConnectionId,
        fetchedForms: formsResult.items.length,
        hasMoreFormPages: formsResult.hasMorePages,
        forcedFullSync: payload.forceFullSync,
      },
      'Processed Google sync job using provider API',
    );
  } catch (error) {
    const message = extractErrorMessage(error);
    throw new SyncJobProcessingError(
      message,
      {
        stage,
        effectiveConnectionId,
        provider,
      },
      error,
    );
  }
}

async function handleMessage(
  message: ConsumeMessage,
  channel: Channel,
  pool: Pool,
  logger: Logger,
  config: WorkerConfig,
): Promise<void> {
  let parsedMessage: SyncJobMessage;

  try {
    const decoded = JSON.parse(message.content.toString('utf-8')) as unknown;
    parsedMessage = SyncJobMessageSchema.parse(decoded);
  } catch (error) {
    logger.error(
      {
        error: serializeError(error),
        rawMessage: message.content.toString('utf-8'),
      },
      'Invalid sync message payload, dead-lettering',
    );
    channel.nack(message, false, false);
    return;
  }

  try {
    await markJobRunning(pool, parsedMessage.jobId);
    await processSyncJob(parsedMessage, pool, config, logger);
    await markJobSucceeded(pool, parsedMessage.jobId);
    channel.ack(message);
  } catch (error) {
    const reason = extractErrorMessage(error);
    await markJobFailed(pool, parsedMessage.jobId, reason);

    const processingError = error instanceof SyncJobProcessingError ? error : null;
    logger.error(
      {
        error: serializeError(error),
        errorSummary: createErrorSummary(error),
        stage: processingError?.context.stage ?? null,
        provider: processingError?.context.provider ?? null,
        effectiveConnectionId: processingError?.context.effectiveConnectionId ?? null,
        jobId: parsedMessage.jobId,
        connectionId: parsedMessage.connectionId,
        requestedBy: parsedMessage.requestedBy,
        trigger: parsedMessage.trigger,
        formId: parsedMessage.formId ?? null,
        forceFullSync: parsedMessage.forceFullSync,
      },
      'Sync job failed',
    );
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

  await runExportLifecycleTick();
  const exportInterval = setInterval(() => {
    void runExportLifecycleTick();
  }, config.EXPORT_POLL_INTERVAL_MS);

  const consumer = await channel.consume(QUEUES.SYNC_JOBS, async (message) => {
    if (!message) {
      return;
    }

    await handleMessage(message, channel, pool, logger, config);
  });

  logger.info(
    {
      queue: QUEUES.SYNC_JOBS,
      prefetch: config.RABBITMQ_PREFETCH,
      consumerTag: consumer.consumerTag,
      exportPollIntervalMs: config.EXPORT_POLL_INTERVAL_MS,
    },
    'Worker started',
  );

  const shutdown = async () => {
    setWorkerState({
      service: 'worker',
      status: 'ready',
    });

    try {
      clearInterval(exportInterval);
      await channel.cancel(consumer.consumerTag);
      await channel.close();
      await connection.close();
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

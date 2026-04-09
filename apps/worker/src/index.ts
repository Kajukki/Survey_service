import amqplib, { type Channel, type ConsumeMessage } from 'amqplib';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { pino, type Logger } from 'pino';
import { Pool } from 'pg';
import { z } from 'zod';
import { GoogleFormsConnector, type ConnectorHttpClient } from '@survey-service/connectors';
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
  CREDENTIAL_ENCRYPTION_KEY_B64: z
    .string()
    .min(1, 'CREDENTIAL_ENCRYPTION_KEY_B64 is required')
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'CREDENTIAL_ENCRYPTION_KEY_B64 must be a base64-encoded 32-byte key'),
  CREDENTIAL_ENCRYPTION_KEY_VERSION: z
    .string()
    .min(1, 'CREDENTIAL_ENCRYPTION_KEY_VERSION is required'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, 'GOOGLE_OAUTH_CLIENT_ID is required'),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1, 'GOOGLE_OAUTH_CLIENT_SECRET is required'),
  GOOGLE_OAUTH_AUTH_BASE_URL: z
    .string()
    .url('GOOGLE_OAUTH_AUTH_BASE_URL must be a valid URL')
    .default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_OAUTH_TOKEN_URL: z
    .string()
    .url('GOOGLE_OAUTH_TOKEN_URL must be a valid URL')
    .default('https://oauth2.googleapis.com/token'),
  GOOGLE_FORMS_API_BASE_URL: z
    .string()
    .url('GOOGLE_FORMS_API_BASE_URL must be a valid URL')
    .default('https://forms.googleapis.com/v1'),
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

interface ProviderTokenSetLike {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  tokenType?: string;
}

interface EncryptedCredentialPayload {
  tokenSet: ProviderTokenSetLike;
  idToken: string;
}

interface ProviderConnectionRow {
  id: string;
  owner_id: string;
  provider: 'google' | 'microsoft';
  encrypted_token_payload: string | null;
  encrypted_token_iv: string | null;
  encrypted_token_tag: string | null;
  encrypted_token_key_version: string | null;
  expires_at: Date | string;
  scope: string | null;
  token_type: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const PLACEHOLDER_CONNECTION_ID = '00000000-0000-0000-0000-000000000000';

function serializeError(error: unknown): Record<string, unknown> {
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
    return {
      ...(error as Record<string, unknown>),
    };
  }

  return {
    value: String(error),
  };
}

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
          const body = await response.json().catch(() => undefined);
          throw {
            message: `Google API request failed with status ${response.status}`,
            response: {
              status: response.status,
              data: body,
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

function decryptCredentialPayload(
  config: WorkerConfig,
  connection: ProviderConnectionRow,
): EncryptedCredentialPayload {
  if (
    !connection.encrypted_token_payload ||
    !connection.encrypted_token_iv ||
    !connection.encrypted_token_tag
  ) {
    throw new Error('Provider connection is missing encrypted credential payload fields');
  }

  const key = Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY_B64, 'base64');
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(connection.encrypted_token_iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(connection.encrypted_token_tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(connection.encrypted_token_payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  const parsed = JSON.parse(plaintext) as EncryptedCredentialPayload;
  if (!parsed?.tokenSet?.accessToken || !parsed?.tokenSet?.expiresAt || !parsed?.idToken) {
    throw new Error('Decrypted provider credentials payload is invalid');
  }

  return parsed;
}

function encryptCredentialPayload(
  config: WorkerConfig,
  payload: EncryptedCredentialPayload,
): {
  encryptedTokenPayload: string;
  encryptedTokenIv: string;
  encryptedTokenTag: string;
  encryptedTokenKeyVersion: string;
} {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const key = Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY_B64, 'base64');
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encoded = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedTokenPayload: ciphertext.toString('base64'),
    encryptedTokenIv: iv.toString('base64'),
    encryptedTokenTag: authTag.toString('base64'),
    encryptedTokenKeyVersion: config.CREDENTIAL_ENCRYPTION_KEY_VERSION,
  };
}

function isTokenExpiringSoon(expiresAt: string, thresholdMs: number = 60_000): boolean {
  const value = Date.parse(expiresAt);
  if (!Number.isFinite(value)) {
    return true;
  }

  return value <= Date.now() + thresholdMs;
}

async function processSyncJob(
  payload: SyncJobMessage,
  pool: Pool,
  config: WorkerConfig,
  logger: Logger,
): Promise<void> {
  const hasPlaceholderConnectionId = payload.connectionId === PLACEHOLDER_CONNECTION_ID;

  const connectionResult = hasPlaceholderConnectionId
    ? await pool.query<ProviderConnectionRow>(
        `
          SELECT
            id,
            owner_id,
            provider,
            encrypted_token_payload,
            encrypted_token_iv,
            encrypted_token_tag,
            encrypted_token_key_version,
            expires_at,
            scope,
            token_type
          FROM provider_connections
          WHERE owner_id = $1 AND provider = 'google'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [payload.requestedBy],
      )
    : await pool.query<ProviderConnectionRow>(
        `
          SELECT
            id,
            owner_id,
            provider,
            encrypted_token_payload,
            encrypted_token_iv,
            encrypted_token_tag,
            encrypted_token_key_version,
            expires_at,
            scope,
            token_type
          FROM provider_connections
          WHERE id = $1 AND owner_id = $2
          LIMIT 1
        `,
        [payload.connectionId, payload.requestedBy],
      );

  const connection = connectionResult.rows[0];
  if (!connection) {
    if (hasPlaceholderConnectionId) {
      throw new Error(
        'Sync request did not include a connectionId and no Google connection exists for this user',
      );
    }

    throw new Error('Provider connection not found for sync job and requester');
  }

  if (hasPlaceholderConnectionId) {
    logger.warn(
      {
        jobId: payload.jobId,
        requestedBy: payload.requestedBy,
        resolvedConnectionId: connection.id,
      },
      'Resolved placeholder connectionId to most recent Google connection for requester',
    );
  }

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

  const decrypted = decryptCredentialPayload(config, connection);
  let tokenSet = decrypted.tokenSet;

  if (isTokenExpiringSoon(tokenSet.expiresAt)) {
    if (!tokenSet.refreshToken) {
      throw new Error('Google access token is expired and no refresh token is available');
    }

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

    await pool.query(
      `
        UPDATE provider_connections
        SET
          encrypted_token_payload = $2,
          encrypted_token_iv = $3,
          encrypted_token_tag = $4,
          encrypted_token_key_version = $5,
          expires_at = $6,
          scope = $7,
          token_type = $8,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        connection.id,
        encrypted.encryptedTokenPayload,
        encrypted.encryptedTokenIv,
        encrypted.encryptedTokenTag,
        encrypted.encryptedTokenKeyVersion,
        tokenSet.expiresAt,
        tokenSet.scope ?? null,
        tokenSet.tokenType ?? 'Bearer',
      ],
    );
  }

  const formsPage = await connector.listForms({
    accessToken: tokenSet.accessToken,
  });

  logger.info(
    {
      jobId: payload.jobId,
      connectionId: payload.connectionId,
      fetchedForms: formsPage.items.length,
      hasNextPage: Boolean(formsPage.nextPageToken),
      forcedFullSync: payload.forceFullSync,
    },
    'Processed Google sync job using provider API',
  );
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
    const reason = error instanceof Error ? error.message : 'unknown worker error';
    await markJobFailed(pool, parsedMessage.jobId, reason);
    logger.error(
      {
        error: serializeError(error),
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

  currentState = {
    service: 'worker',
    status: 'running',
  };

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

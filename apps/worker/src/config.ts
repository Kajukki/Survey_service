import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { CONSUMER_PREFETCH } from '@survey-service/messaging';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKER_ROLE: z.enum(['all', 'sync', 'export']).default('all'),
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
  EXPORT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function loadEnvironmentFiles(): void {
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

export function loadConfig(): WorkerConfig {
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

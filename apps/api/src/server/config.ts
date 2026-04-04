/**
 * Configuration and environment validation for the API server.
 * All required environment variables are validated at startup.
 */
import { z } from 'zod';

/**
 * Schema for environment variables.
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  DATABASE_POOL_MIN: z.coerce.number().default(2),

  // RabbitMQ
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  RABBITMQ_PREFETCH: z.coerce.number().default(10),

  // Authentication
  OIDC_ISSUER: z.string().min(1, 'OIDC_ISSUER is required'),
  OIDC_AUDIENCE: z.string().min(1, 'OIDC_AUDIENCE is required'),
  OIDC_JWKS_URI: z.string().min(1, 'OIDC_JWKS_URI is required'),

  // CORS
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((v) => v.split(',')),

  // Feature flags
  ENABLE_RATE_LIMITING: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  RATE_LIMIT_TTL: z.coerce.number().default(60),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

/**
 * Parsed environment configuration.
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Load and validate configuration from environment variables.
 * Throws if any required variable is missing or invalid.
 */
export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')} - ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  return result.data;
}

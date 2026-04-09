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
  AUTH_MODE: z.enum(['local', 'oidc']).default('local'),
  OIDC_ISSUER: z.string().min(1, 'OIDC_ISSUER is required'),
  OIDC_AUDIENCE: z.string().min(1, 'OIDC_AUDIENCE is required'),
  OIDC_JWKS_URI: z.string().url('OIDC_JWKS_URI must be a valid URL').optional(),
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 chars').optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  // Application-layer credential encryption
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

  // Google OAuth (provider auth flow)
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
  GOOGLE_OAUTH_ALLOWED_SCOPES: z
    .string()
    .default(
      'https://www.googleapis.com/auth/forms.body.readonly,https://www.googleapis.com/auth/forms.responses.readonly',
    )
    .transform((value) =>
      value
        .split(',')
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    )
    .pipe(z.array(z.string().min(1)).min(1, 'At least one GOOGLE_OAUTH_ALLOWED_SCOPES entry is required')),

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
}).superRefine((value, context) => {
  if (value.AUTH_MODE === 'local' && !value.AUTH_JWT_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_JWT_SECRET'],
      message: 'AUTH_JWT_SECRET is required when AUTH_MODE=local',
    });
  }

  if (value.AUTH_MODE === 'oidc' && !value.OIDC_JWKS_URI) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OIDC_JWKS_URI'],
      message: 'OIDC_JWKS_URI is required when AUTH_MODE=oidc',
    });
  }
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

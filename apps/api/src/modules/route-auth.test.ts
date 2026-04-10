import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../server/config';
import { registerPrincipalPlugin } from '../server/principal';
import { connectionsRoutes } from './connections/connections.route';
import { formsRoutes } from './forms/forms.route';
import { sharingRoutes } from './sharing/sharing.route';

function buildConfig(): Config {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://localhost/test',
    DATABASE_POOL_MAX: 10,
    DATABASE_POOL_MIN: 2,
    RABBITMQ_URL: 'amqp://localhost',
    RABBITMQ_PREFETCH: 10,
    OIDC_ISSUER: 'https://issuer.example.com',
    OIDC_AUDIENCE: 'survey-service',
    OIDC_JWKS_URI: 'https://issuer.example.com/.well-known/jwks.json',
    ALLOWED_ORIGINS: ['http://localhost:4200'],
    ENABLE_RATE_LIMITING: true,
    RATE_LIMIT_TTL: 60,
    RATE_LIMIT_MAX: 100,
    AUTH_JWT_SECRET: 'test-secret-test-secret-test-secret',
    AUTH_MODE: 'local',
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_SECONDS: 604800,
    CREDENTIAL_ENCRYPTION_KEY_B64: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    CREDENTIAL_ENCRYPTION_KEY_VERSION: 'v1',
    GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_OAUTH_AUTH_BASE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    GOOGLE_OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    GOOGLE_FORMS_API_BASE_URL: 'https://forms.googleapis.com/v1',
    GOOGLE_OAUTH_ALLOWED_SCOPES: [
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ],
  };
}

async function buildApp() {
  const config = buildConfig();
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'internal_error';

    return reply.code(statusCode).send({
      success: false,
      error: {
        code,
        message: error.message,
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  const fakeDb = {} as any;

  await registerPrincipalPlugin(app, config);
  await connectionsRoutes(app, { db: fakeDb, config });
  await formsRoutes(app, { db: fakeDb });
  await sharingRoutes(app, { db: fakeDb });

  return { app };
}

describe('protected domain routes', () => {
  const formId = '11111111-1111-4111-8111-111111111111';

  it('returns 401 when accessing protected routes without a token', async () => {
    const { app } = await buildApp();

    const [connections, forms, shares] = await Promise.all([
      app.inject({ method: 'GET', url: '/connections' }),
      app.inject({ method: 'GET', url: '/forms' }),
      app.inject({ method: 'GET', url: `/forms/${formId}/shares` }),
    ]);

    expect(connections.statusCode).toBe(401);
    expect(forms.statusCode).toBe(401);
    expect(shares.statusCode).toBe(401);
  });
});

import Fastify from 'fastify';
import { SignJWT } from 'jose';
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
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_SECONDS: 604800,
  };
}

async function signAccessToken(config: Config): Promise<string> {
  const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET);

  return new SignJWT({ org: 'default-org' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-one')
    .setIssuer(config.OIDC_ISSUER)
    .setAudience(config.OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
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

  await registerPrincipalPlugin(app, config);
  await connectionsRoutes(app);
  await formsRoutes(app);
  await sharingRoutes(app);

  return { app, config };
}

describe('protected domain routes', () => {
  it('returns 401 when accessing protected routes without a token', async () => {
    const { app } = await buildApp();

    const [connections, forms, shares] = await Promise.all([
      app.inject({ method: 'GET', url: '/connections' }),
      app.inject({ method: 'GET', url: '/forms' }),
      app.inject({ method: 'GET', url: '/forms/mock-form-id/shares' }),
    ]);

    expect(connections.statusCode).toBe(401);
    expect(forms.statusCode).toBe(401);
    expect(shares.statusCode).toBe(401);
  });

  it('allows authenticated requests on protected routes', async () => {
    const { app, config } = await buildApp();
    const token = await signAccessToken(config);

    const [connections, forms, shares] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/connections',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({ method: 'GET', url: '/forms', headers: { authorization: `Bearer ${token}` } }),
      app.inject({
        method: 'GET',
        url: '/forms/mock-form-id/shares',
        headers: { authorization: `Bearer ${token}` },
      }),
    ]);

    expect(connections.statusCode).toBe(200);
    expect(forms.statusCode).toBe(200);
    expect(shares.statusCode).toBe(200);
  });
});
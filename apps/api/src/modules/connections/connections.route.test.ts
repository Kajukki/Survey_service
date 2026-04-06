import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../../server/config';
import { registerPrincipalPlugin } from '../../server/principal';
import { connectionsRoutes } from './connections.route';

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

async function signAccessToken(config: Config, userId: string = 'user-one'): Promise<string> {
  const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET);

  return new SignJWT({ org: 'default-org' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(config.OIDC_ISSUER)
    .setAudience(config.OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

function createFakeDbReturning(rows: unknown[]) {
  const execute = vi.fn(async () => rows);
  const where = vi.fn(() => ({ execute }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));

  return {
    selectFrom,
    select,
    where,
    execute,
    db: {
      selectFrom,
    },
  };
}

async function buildApp(db?: unknown) {
  const config = buildConfig();
  const app = Fastify();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerPrincipalPlugin(app, config);
  await connectionsRoutes(app, db ? { db: db as any } : undefined);

  return { app, config };
}

describe('connections routes', () => {
  it('lists DB-backed provider connections for authenticated principal', async () => {
    const fakeDb = createFakeDbReturning([
      {
        id: 'conn-db-1',
        owner_id: 'user-one',
        provider: 'google',
        external_account_id: 'google-user-1',
        name: 'Google Forms Connection',
        created_at: '2026-04-06T00:00:00.000Z',
        updated_at: '2026-04-06T00:00:00.000Z',
      },
    ]);

    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'GET',
      url: '/connections',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fakeDb.selectFrom).toHaveBeenCalledWith('provider_connections');
    expect(fakeDb.where).toHaveBeenCalledWith('owner_id', '=', 'user-one');

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual([
      {
        id: 'conn-db-1',
        type: 'google',
        name: 'Google Forms Connection',
        externalId: 'google-user-1',
        ownerId: 'user-one',
        syncStatus: 'idle',
        createdAt: '2026-04-06T00:00:00.000Z',
        updatedAt: '2026-04-06T00:00:00.000Z',
      },
    ]);
  });

  it('falls back to mock connection list when no db dependency is provided', async () => {
    const { app, config } = await buildApp();
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'GET',
      url: '/connections',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeGreaterThan(0);
  });
});

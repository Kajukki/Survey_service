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

async function signAccessToken(config: Config, userId: string = 'user-one'): Promise<string> {
  const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET!);

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

function createFakeDbDeleteResult(deletedId: string | null) {
  const executeTakeFirst = vi.fn(async () => (deletedId ? { id: deletedId } : undefined));
  const returning = vi.fn(() => ({ executeTakeFirst }));
  const whereSecond = vi.fn(() => ({ returning }));
  const whereFirst = vi.fn(() => ({ where: whereSecond }));
  const deleteFrom = vi.fn(() => ({ where: whereFirst }));

  return {
    deleteFrom,
    whereFirst,
    whereSecond,
    returning,
    executeTakeFirst,
    db: {
      deleteFrom,
    },
  };
}

function createFakeDbCreateResult(createdRow: {
  id: string;
  owner_id: string;
  provider: 'google' | 'microsoft';
  external_account_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}) {
  const executeTakeFirstOrThrow = vi.fn(async () => createdRow);
  const returning = vi.fn(() => ({ executeTakeFirstOrThrow }));
  const doUpdateSet = vi.fn(() => ({ returning }));
  const columns = vi.fn(() => ({ doUpdateSet }));
  const onConflict = vi.fn((builder: (oc: { columns: typeof columns }) => unknown) => {
    builder({ columns });
    return { returning };
  });
  const values = vi.fn(() => ({ onConflict }));
  const insertInto = vi.fn(() => ({ values }));

  return {
    insertInto,
    values,
    onConflict,
    columns,
    doUpdateSet,
    returning,
    executeTakeFirstOrThrow,
    db: {
      insertInto,
    },
  };
}

async function buildApp(db: unknown) {
  const config = buildConfig();
  const app = Fastify();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerPrincipalPlugin(app, config);
  await connectionsRoutes(app, { db: db as any, config });

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

  it('deletes DB-backed connection for owner', async () => {
    const fakeDb = createFakeDbDeleteResult('conn-db-1');
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'DELETE',
      url: '/connections/conn-db-1',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(fakeDb.deleteFrom).toHaveBeenCalledWith('provider_connections');
    expect(fakeDb.whereFirst).toHaveBeenCalledWith('id', '=', 'conn-db-1');
    expect(fakeDb.whereSecond).toHaveBeenCalledWith('owner_id', '=', 'user-one');
  });

  it('creates DB-backed connection with encrypted credential payload', async () => {
    const fakeDb = createFakeDbCreateResult({
      id: 'conn-created-1',
      owner_id: 'user-one',
      provider: 'google',
      external_account_id: 'google-account-9',
      name: 'Primary Google',
      created_at: '2026-04-09T00:00:00.000Z',
      updated_at: '2026-04-09T00:00:00.000Z',
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'POST',
      url: '/connections',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'google',
        name: 'Primary Google',
        externalId: 'google-account-9',
        credentialToken: 'opaque-credential-token',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(fakeDb.insertInto).toHaveBeenCalledWith('provider_connections');
    expect(fakeDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user-one',
        provider: 'google',
        external_account_id: 'google-account-9',
        name: 'Primary Google',
        encrypted_token_payload: expect.any(String),
        encrypted_token_iv: expect.any(String),
        encrypted_token_tag: expect.any(String),
        encrypted_token_key_version: 'v1',
      }),
    );

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({
      id: 'conn-created-1',
      type: 'google',
      name: 'Primary Google',
      externalId: 'google-account-9',
      ownerId: 'user-one',
      syncStatus: 'idle',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    });
  });

  it('returns 400 when create payload validation fails', async () => {
    const fakeDb = createFakeDbCreateResult({
      id: 'conn-created-1',
      owner_id: 'user-one',
      provider: 'google',
      external_account_id: 'google-account-9',
      name: 'Primary Google',
      created_at: '2026-04-09T00:00:00.000Z',
      updated_at: '2026-04-09T00:00:00.000Z',
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'POST',
      url: '/connections',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'google',
        name: '',
        externalId: 'google-account-9',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when DB-backed connection is outside owner scope', async () => {
    const fakeDb = createFakeDbDeleteResult(null);
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'DELETE',
      url: '/connections/conn-db-missing',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(fakeDb.deleteFrom).toHaveBeenCalledWith('provider_connections');
  });
});

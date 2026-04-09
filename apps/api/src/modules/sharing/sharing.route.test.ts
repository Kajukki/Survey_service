import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../../server/config';
import { registerPrincipalPlugin } from '../../server/principal';
import { sharingRoutes } from './sharing.route';

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

function createFakeSharingDb(input: {
  hasOwnedForm: boolean;
  listedShares?: Array<{
    id: string;
    form_id: string;
    grantee_user_id: string;
    permission_level: 'read' | 'write' | 'admin';
    created_at: string;
  }>;
  createdShare?: {
    id: string;
    form_id: string;
    grantee_user_id: string;
    permission_level: 'read' | 'write' | 'admin';
    created_at: string;
  };
  deletedShareId?: string | null;
}) {
  const formExecuteTakeFirst = vi.fn(async () =>
    input.hasOwnedForm ? { id: 'form-1' } : undefined,
  );
  const formWhereOwner = vi.fn(() => ({ executeTakeFirst: formExecuteTakeFirst }));
  const formWhereId = vi.fn(() => ({ where: formWhereOwner }));
  const formSelect = vi.fn(() => ({ where: formWhereId }));

  const sharesExecute = vi.fn(async () => input.listedShares ?? []);
  const sharesOrderBy = vi.fn(() => ({ execute: sharesExecute }));
  const sharesWhere = vi.fn(() => ({ orderBy: sharesOrderBy }));
  const sharesSelect = vi.fn(() => ({ where: sharesWhere }));

  const insertExecuteTakeFirstOrThrow = vi.fn(
    async () =>
      input.createdShare ?? {
        id: 'share-created-1',
        form_id: '11111111-1111-4111-8111-111111111111',
        grantee_user_id: '22222222-2222-4222-8222-222222222222',
        permission_level: 'read',
        created_at: '2026-04-09T12:00:00.000Z',
      },
  );
  const insertReturning = vi.fn(() => ({ executeTakeFirstOrThrow: insertExecuteTakeFirstOrThrow }));
  const insertDoUpdateSet = vi.fn(() => ({}));
  const insertColumns = vi.fn(() => ({ doUpdateSet: insertDoUpdateSet }));
  const insertOnConflict = vi.fn((builder: (oc: { columns: typeof insertColumns }) => unknown) => {
    builder({ columns: insertColumns });
    return {
      returning: insertReturning,
    };
  });
  const insertValues = vi.fn(() => ({ onConflict: insertOnConflict }));
  const insertInto = vi.fn(() => ({ values: insertValues }));

  const deleteExecuteTakeFirst = vi.fn(async () =>
    input.deletedShareId ? { id: input.deletedShareId } : undefined,
  );
  const deleteReturning = vi.fn(() => ({ executeTakeFirst: deleteExecuteTakeFirst }));
  const deleteWhereId = vi.fn(() => ({ returning: deleteReturning }));
  const deleteWhereForm = vi.fn(() => ({ where: deleteWhereId }));
  const deleteFrom = vi.fn(() => ({ where: deleteWhereForm }));

  const selectFrom = vi.fn((table: string) => {
    if (table === 'forms') {
      return { select: formSelect };
    }

    if (table === 'form_shares') {
      return { select: sharesSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    db: {
      selectFrom,
      insertInto,
      deleteFrom,
    },
    spies: {
      selectFrom,
      insertInto,
      deleteFrom,
      insertValues,
      insertOnConflict,
    },
  };
}

async function buildApp(fakeDb: unknown) {
  const config = buildConfig();
  const app = Fastify();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerPrincipalPlugin(app, config);
  await sharingRoutes(app, { db: fakeDb as any });

  return { app, config };
}

describe('sharing routes', () => {
  const formId = '11111111-1111-4111-8111-111111111111';

  it('returns 401 without token', async () => {
    const fakeDb = createFakeSharingDb({
      hasOwnedForm: false,
    });
    const { app } = await buildApp(fakeDb.db);

    const response = await app.inject({
      method: 'GET',
      url: `/forms/${formId}/shares`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists DB-backed shares for an owned form', async () => {
    const fakeDb = createFakeSharingDb({
      hasOwnedForm: true,
      listedShares: [
        {
          id: 'share-1',
          form_id: formId,
          grantee_user_id: '22222222-2222-4222-8222-222222222222',
          permission_level: 'read',
          created_at: '2026-04-09T12:00:00.000Z',
        },
      ],
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/forms/${formId}/shares`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fakeDb.spies.selectFrom).toHaveBeenCalledWith('forms');
    expect(fakeDb.spies.selectFrom).toHaveBeenCalledWith('form_shares');
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.id).toBe('share-1');
  });

  it('creates DB-backed share for owned form', async () => {
    const fakeDb = createFakeSharingDb({
      hasOwnedForm: true,
      createdShare: {
        id: 'share-created-9',
        form_id: formId,
        grantee_user_id: '22222222-2222-4222-8222-222222222222',
        permission_level: 'write',
        created_at: '2026-04-09T13:00:00.000Z',
      },
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'POST',
      url: `/forms/${formId}/shares`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        grantee_user_id: '22222222-2222-4222-8222-222222222222',
        permission_level: 'write',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(fakeDb.spies.insertInto).toHaveBeenCalledWith('form_shares');
    expect(fakeDb.spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        form_id: formId,
        grantee_user_id: '22222222-2222-4222-8222-222222222222',
      }),
    );
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe('share-created-9');
  });

  it('deletes DB-backed share for owned form', async () => {
    const fakeDb = createFakeSharingDb({
      hasOwnedForm: true,
      deletedShareId: 'share-delete-1',
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'DELETE',
      url: `/forms/${formId}/shares/share-delete-1`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(fakeDb.spies.deleteFrom).toHaveBeenCalledWith('form_shares');
  });

  it('returns 404 when requester does not own the form', async () => {
    const fakeDb = createFakeSharingDb({
      hasOwnedForm: false,
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'other-user');

    const response = await app.inject({
      method: 'GET',
      url: `/forms/${formId}/shares`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

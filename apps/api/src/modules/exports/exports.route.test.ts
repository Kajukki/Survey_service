import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../../server/config';
import { registerPrincipalPlugin } from '../../server/principal';
import { exportsRoutes } from './exports.route';

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
    OUTBOX_POLL_INTERVAL_MS: 5000,
    OUTBOX_BATCH_SIZE: 100,
    OUTBOX_MAX_ATTEMPTS: 3,
    OUTBOX_RETRY_BASE_MS: 1000,
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

function createFakeExportsDb(input: {
  exportJobs: Array<{
    id: string;
    format: 'csv' | 'json' | 'excel';
    status: 'queued' | 'ready' | 'failed';
    requested_at: string;
  }>;
  exportDetail?: {
    id: string;
    format: 'csv' | 'json' | 'excel';
    status: 'queued' | 'ready' | 'failed';
    requested_at: string;
    download_url: string | null;
    error: string | null;
    completed_at: string | null;
  } | null;
  exportDownload?: {
    id: string;
    status: 'queued' | 'ready' | 'failed';
    download_url: string | null;
  } | null;
  ownedFormId: string | null;
  insertedExportJob?: {
    id: string;
    format: 'csv' | 'json' | 'excel';
    status: 'queued';
    requested_at: string;
  };
}): {
  db: ReturnType<typeof createFakeExportsDb>['db'];
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const exportJobsExecute = vi.fn(async () => input.exportJobs);
  const exportJobsOrderBy = vi.fn(() => ({ execute: exportJobsExecute }));
  const exportJobsWhere = vi.fn(() => ({ orderBy: exportJobsOrderBy }));
  const exportDetailExecuteTakeFirst = vi.fn(async () => input.exportDetail ?? undefined);
  const exportDetailWhereOwner = vi.fn(() => ({ executeTakeFirst: exportDetailExecuteTakeFirst }));
  const exportDetailWhereId = vi.fn(() => ({ where: exportDetailWhereOwner }));

  const exportDownloadExecuteTakeFirst = vi.fn(async () => input.exportDownload ?? undefined);
  const exportDownloadWhereOwner = vi.fn(() => ({
    executeTakeFirst: exportDownloadExecuteTakeFirst,
  }));
  const exportDownloadWhereId = vi.fn(() => ({ where: exportDownloadWhereOwner }));

  const exportJobsSelect = vi.fn((columns: unknown) => {
    const selected = Array.isArray(columns) ? columns : [columns];

    if (selected.includes('download_url') && selected.includes('error')) {
      return { where: exportDetailWhereId };
    }

    if (selected.includes('download_url') && !selected.includes('error')) {
      return { where: exportDownloadWhereId };
    }

    return { where: exportJobsWhere };
  });

  const formExecuteTakeFirst = vi.fn(async () =>
    input.ownedFormId ? { id: input.ownedFormId } : undefined,
  );
  const formWhereOwner = vi.fn(() => ({ executeTakeFirst: formExecuteTakeFirst }));
  const formWhereId = vi.fn(() => ({ where: formWhereOwner }));
  const formSelect = vi.fn(() => ({ where: formWhereId }));

  const exportInsertExecuteTakeFirstOrThrow = vi.fn(
    async () =>
      input.insertedExportJob ?? {
        id: 'exp-new-1',
        format: 'csv',
        status: 'queued',
        requested_at: '2026-04-09T12:00:00.000Z',
      },
  );
  const exportInsertReturning = vi.fn(() => ({
    executeTakeFirstOrThrow: exportInsertExecuteTakeFirstOrThrow,
  }));
  const exportInsertValues = vi.fn(() => ({ returning: exportInsertReturning }));
  const exportInsertInto = vi.fn(() => ({ values: exportInsertValues }));

  const selectFrom = vi.fn((table: string) => {
    if (table === 'export_jobs') {
      return { select: exportJobsSelect };
    }

    if (table === 'forms') {
      return { select: formSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    db: {
      selectFrom,
      insertInto: exportInsertInto,
    },
    spies: {
      selectFrom,
      exportInsertInto,
      exportInsertValues,
      exportDetailWhereId,
      exportDetailWhereOwner,
      exportDownloadWhereId,
      exportDownloadWhereOwner,
    },
  };
}

async function buildApp(fakeDb: ReturnType<typeof createFakeExportsDb>['db']) {
  const config = buildConfig();
  const app = Fastify();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerPrincipalPlugin(app, config);
  await exportsRoutes(app, { db: fakeDb });

  return { app, config };
}

describe('exports routes', () => {
  it('returns 401 without token', async () => {
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
    });
    const { app } = await buildApp(fakeDb.db);

    const response = await app.inject({
      method: 'GET',
      url: '/exports',
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists DB-backed export jobs for authenticated principal', async () => {
    const fakeDb = createFakeExportsDb({
      exportJobs: [
        {
          id: 'exp-1',
          format: 'csv',
          status: 'ready',
          requested_at: '2026-04-08T10:00:00.000Z',
        },
      ],
      ownedFormId: null,
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: '/exports',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fakeDb.spies.selectFrom).toHaveBeenCalledWith('export_jobs');
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.id).toBe('exp-1');
  });

  it('returns 404 for export create when form is not owned by requester', async () => {
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'POST',
      url: '/exports',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formId: '11111111-1111-4111-8111-111111111111',
        format: 'csv',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('creates a queued DB-backed export job when form is owned', async () => {
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: '11111111-1111-4111-8111-111111111111',
      insertedExportJob: {
        id: 'exp-new-9',
        format: 'json',
        status: 'queued',
        requested_at: '2026-04-09T12:34:56.000Z',
      },
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'POST',
      url: '/exports',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formId: '11111111-1111-4111-8111-111111111111',
        format: 'json',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(fakeDb.spies.exportInsertInto).toHaveBeenCalledWith('export_jobs');
    expect(fakeDb.spies.exportInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        requested_by: 'user-one',
        form_id: '11111111-1111-4111-8111-111111111111',
        format: 'json',
      }),
    );
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe('exp-new-9');
    expect(payload.data.status).toBe('queued');
  });

  it('gets DB-backed export detail for owner', async () => {
    const exportId = '11111111-1111-4111-8111-111111111111';
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
      exportDetail: {
        id: exportId,
        format: 'csv',
        status: 'ready',
        requested_at: '2026-04-09T12:34:56.000Z',
        download_url: 'https://example.com/export.csv',
        error: null,
        completed_at: '2026-04-09T12:35:56.000Z',
      },
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/exports/${exportId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fakeDb.spies.exportDetailWhereId).toHaveBeenCalledWith('id', '=', exportId);
    expect(fakeDb.spies.exportDetailWhereOwner).toHaveBeenCalledWith(
      'requested_by',
      '=',
      'user-one',
    );
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(exportId);
    expect(payload.data.download_url).toBe('https://example.com/export.csv');
  });

  it('returns 404 for export detail outside owner scope', async () => {
    const exportId = '11111111-1111-4111-8111-111111111111';
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
      exportDetail: null,
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/exports/${exportId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns ready download URL for owner when export is ready', async () => {
    const exportId = '11111111-1111-4111-8111-111111111111';
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
      exportDownload: {
        id: exportId,
        status: 'ready',
        download_url: 'https://example.com/export.csv',
      },
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/exports/${exportId}/download`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fakeDb.spies.exportDownloadWhereId).toHaveBeenCalledWith('id', '=', exportId);
    expect(fakeDb.spies.exportDownloadWhereOwner).toHaveBeenCalledWith(
      'requested_by',
      '=',
      'user-one',
    );
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.download_url).toBe('https://example.com/export.csv');
  });

  it('returns 409 when export download is requested before ready state', async () => {
    const exportId = '11111111-1111-4111-8111-111111111111';
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
      exportDownload: {
        id: exportId,
        status: 'queued',
        download_url: null,
      },
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/exports/${exportId}/download`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 404 when export download is outside owner scope', async () => {
    const exportId = '11111111-1111-4111-8111-111111111111';
    const fakeDb = createFakeExportsDb({
      exportJobs: [],
      ownedFormId: null,
      exportDownload: null,
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: `/exports/${exportId}/download`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

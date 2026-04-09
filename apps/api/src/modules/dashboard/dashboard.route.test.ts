import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../../server/config';
import { registerPrincipalPlugin } from '../../server/principal';
import { dashboardRoutes } from './dashboard.route';

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

function createFakeDashboardDb(input: {
  ownerForm: { id: string; title: string; response_count: number } | null;
  sharedForm: { id: string; title: string; response_count: number } | null;
  shareAccess: boolean;
  jobs: Array<{ id: string; status: string; trigger: string; created_at: string }>;
  shares: Array<{ permission_level: 'read' | 'write' | 'admin' }>;
}) {
  const formExecuteTakeFirstOwner = vi.fn(async () => input.ownerForm ?? undefined);
  const formExecuteTakeFirstShared = vi.fn(async () => input.sharedForm ?? undefined);

  const formWhereOwner = vi.fn(() => ({ executeTakeFirst: formExecuteTakeFirstOwner }));
  const formWhereIdOwner = vi.fn(() => ({ where: formWhereOwner }));

  const formWhereShared = vi.fn(() => ({ executeTakeFirst: formExecuteTakeFirstShared }));

  const formSelect = vi
    .fn()
    .mockReturnValueOnce({ where: formWhereIdOwner })
    .mockReturnValueOnce({ where: formWhereShared });

  const jobsExecute = vi.fn(async () => input.jobs);
  const jobsWhereTo = vi.fn(() => ({ execute: jobsExecute }));
  const jobsWhereFrom = vi.fn(() => ({ where: jobsWhereTo }));
  const jobsWhereForm = vi.fn(() => ({ where: jobsWhereFrom }));
  const jobsSelect = vi.fn(() => ({ where: jobsWhereForm }));

  const sharesExecute = vi.fn(async () => input.shares);
  const shareAccessExecuteTakeFirst = vi.fn(async () =>
    input.shareAccess ? { form_id: 'form' } : undefined,
  );

  const sharesWhereForList = vi.fn(() => ({ execute: sharesExecute }));
  const sharesWhereForAccessSecond = vi.fn(() => ({
    executeTakeFirst: shareAccessExecuteTakeFirst,
  }));
  const sharesWhereForAccessFirst = vi.fn(() => ({ where: sharesWhereForAccessSecond }));

  const sharesSelect = vi.fn((selection: unknown) => {
    if (Array.isArray(selection)) {
      return { where: sharesWhereForList };
    }

    return { where: sharesWhereForAccessFirst };
  });

  const selectFrom = vi.fn((table: string) => {
    if (table === 'forms') {
      return {
        select: formSelect,
      };
    }

    if (table === 'jobs') {
      return {
        select: jobsSelect,
      };
    }

    if (table === 'form_shares') {
      return {
        select: sharesSelect,
      };
    }

    throw new Error(`Unexpected table in fake db: ${table}`);
  });

  return {
    db: {
      selectFrom,
    },
  };
}

async function buildApp(fakeDb: unknown) {
  const config = buildConfig();
  const app = Fastify();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerPrincipalPlugin(app, config);
  await dashboardRoutes(app, { db: fakeDb as any });

  return { app, config };
}

describe('dashboard routes', () => {
  it('returns 401 without token', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: null,
      sharedForm: null,
      shareAccess: false,
      jobs: [],
      shares: [],
    });
    const { app } = await buildApp(fakeDb.db);

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?formId=11111111-1111-4111-8111-111111111111&from=2026-04-01&to=2026-04-10&granularity=day',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when form is not accessible by requester', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: null,
      sharedForm: null,
      shareAccess: false,
      jobs: [],
      shares: [],
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?formId=11111111-1111-4111-8111-111111111111&from=2026-04-01&to=2026-04-10&granularity=day',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns dashboard payload with kpis, series, and questions', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Customer Survey',
        response_count: 12,
      },
      sharedForm: null,
      shareAccess: false,
      jobs: [
        {
          id: 'job-1',
          status: 'succeeded',
          trigger: 'manual',
          created_at: '2026-04-02T10:00:00.000Z',
        },
        {
          id: 'job-2',
          status: 'failed',
          trigger: 'scheduled',
          created_at: '2026-04-05T11:00:00.000Z',
        },
      ],
      shares: [{ permission_level: 'read' }, { permission_level: 'write' }],
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?formId=11111111-1111-4111-8111-111111111111&from=2026-04-01&to=2026-04-10&granularity=day',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload.kpis)).toBe(true);
    expect(Array.isArray(payload.series)).toBe(true);
    expect(Array.isArray(payload.questions)).toBe(true);
    expect(payload.kpis).toHaveLength(3);
    expect(payload.questions).toHaveLength(3);

    const succeededBucket = payload.questions[0].distribution.find(
      (item: { label: string; value: number }) => item.label === 'Succeeded',
    );
    expect(succeededBucket?.value).toBe(1);
  });

  it('allows dashboard access when form is shared with requester', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: null,
      sharedForm: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Shared Survey',
        response_count: 9,
      },
      shareAccess: true,
      jobs: [
        {
          id: 'job-3',
          status: 'succeeded',
          trigger: 'scheduled',
          created_at: '2026-04-03T08:00:00.000Z',
        },
      ],
      shares: [{ permission_level: 'read' }],
    });
    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-two');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?formId=11111111-1111-4111-8111-111111111111&from=2026-04-01&to=2026-04-10&granularity=day',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.kpis[0]?.value).toBe('9');
  });
});

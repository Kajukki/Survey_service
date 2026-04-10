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
    OUTBOX_POLL_INTERVAL_MS: 1000,
    OUTBOX_BATCH_SIZE: 100,
    OUTBOX_MAX_ATTEMPTS: 10,
    OUTBOX_RETRY_BASE_MS: 1000,
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
  ownerForm:
    | {
        id: string;
        connection_id: string;
        title: string;
        response_count: number;
        updated_at: string;
      }
    | null;
  sharedForm:
    | {
        id: string;
        connection_id: string;
        title: string;
        response_count: number;
        updated_at: string;
      }
    | null;
  shareAccess: boolean;
  jobsInRange: Array<{ id: string; status: string; trigger: string; created_at: string }>;
  latestSucceededSyncJob: { id: string; created_at: string; completed_at: string | null } | null;
  shares: Array<{ permission_level: 'read' | 'write' | 'admin' }>;
  responses: Array<{
    id: string;
    submitted_at: string | null;
    completion: 'completed' | 'partial';
  }>;
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

  const shareAccessExecuteTakeFirst = vi.fn(async () =>
    input.shareAccess ? { form_id: '11111111-1111-4111-8111-111111111111' } : undefined,
  );
  const sharesListExecute = vi.fn(async () => input.shares);
  const sharesWhereList = vi.fn(() => ({ execute: sharesListExecute }));
  const sharesWhereAccessSecond = vi.fn(() => ({ executeTakeFirst: shareAccessExecuteTakeFirst }));
  const sharesWhereAccessFirst = vi.fn(() => ({ where: sharesWhereAccessSecond }));
  const sharesSelect = vi.fn((selection: unknown) => {
    if (Array.isArray(selection)) {
      return { where: sharesWhereList };
    }
    return { where: sharesWhereAccessFirst };
  });

  const jobsInRangeExecute = vi.fn(async () => input.jobsInRange);
  const jobsInRangeWhere3 = vi.fn(() => ({ execute: jobsInRangeExecute }));
  const jobsInRangeWhere2 = vi.fn(() => ({ where: jobsInRangeWhere3 }));
  const jobsInRangeWhere1 = vi.fn(() => ({ where: jobsInRangeWhere2 }));

  const jobsLatestExecuteTakeFirst = vi.fn(async () => input.latestSucceededSyncJob ?? undefined);
  const jobsLatestOrder2 = vi.fn(() => ({ executeTakeFirst: jobsLatestExecuteTakeFirst }));
  const jobsLatestOrder1 = vi.fn(() => ({ orderBy: jobsLatestOrder2 }));
  const jobsLatestWhere2 = vi.fn(() => ({ orderBy: jobsLatestOrder1 }));
  const jobsLatestWhere1 = vi.fn(() => ({ where: jobsLatestWhere2 }));

  const jobsSelect = vi.fn((selection: unknown) => {
    const selected = Array.isArray(selection) ? selection : [selection];
    if (selected.includes('trigger')) {
      return { where: jobsInRangeWhere1 };
    }
    return { where: jobsLatestWhere1 };
  });

  const responsesExecute = vi.fn(async () => input.responses);
  const responsesWhere3 = vi.fn(() => ({ execute: responsesExecute }));
  const responsesWhere2 = vi.fn(() => ({ where: responsesWhere3 }));
  const responsesWhere1 = vi.fn(() => ({ where: responsesWhere2 }));
  const responsesSelect = vi.fn(() => ({ where: responsesWhere1 }));

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

    if (table === 'form_responses') {
      return {
        select: responsesSelect,
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
      jobsInRange: [],
      latestSucceededSyncJob: null,
      shares: [],
      responses: [],
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
      jobsInRange: [],
      latestSucceededSyncJob: null,
      shares: [],
      responses: [],
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

  it('includes sync jobs and responses that occur on the selected to-date', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: {
        id: '11111111-1111-4111-8111-111111111111',
        connection_id: '22222222-2222-4222-8222-222222222222',
        title: 'Customer Survey',
        response_count: 4,
        updated_at: '2026-04-10T00:00:00.000Z',
      },
      sharedForm: null,
      shareAccess: false,
      jobsInRange: [
        {
          id: 'job-3',
          status: 'failed',
          trigger: 'manual',
          created_at: '2026-04-10T18:30:00.000Z',
        },
      ],
      latestSucceededSyncJob: null,
      shares: [],
      responses: [
        {
          id: 'resp-3',
          submitted_at: '2026-04-10T19:00:00.000Z',
          completion: 'completed',
        },
      ],
    });

    const { app, config } = await buildApp(fakeDb.db);
    const token = await signAccessToken(config, 'user-one');

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?formId=11111111-1111-4111-8111-111111111111&from=2026-04-10&to=2026-04-10&granularity=day',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    const syncStatusQuestion = payload.questions.find(
      (question: { id: string }) =>
        question.id === '11111111-1111-4111-8111-111111111111:sync-status',
    );

    expect(payload.kpis[1].delta).toContain('0/1');
    expect(payload.series).toHaveLength(1);
    expect(payload.series[0].count).toBe(1);
    expect(syncStatusQuestion.responses).toBe(1);
    expect(
      syncStatusQuestion.distribution.find((item: { label: string }) => item.label === 'Failed')
        ?.value,
    ).toBe(1);
  });

  it('returns activity-focused dashboard payload for owner', async () => {
    const fakeDb = createFakeDashboardDb({
      ownerForm: {
        id: '11111111-1111-4111-8111-111111111111',
        connection_id: '22222222-2222-4222-8222-222222222222',
        title: 'Customer Survey',
        response_count: 12,
        updated_at: '2026-04-09T00:00:00.000Z',
      },
      sharedForm: null,
      shareAccess: false,
      jobsInRange: [
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
      latestSucceededSyncJob: {
        id: 'job-latest',
        created_at: '2026-04-09T08:00:00.000Z',
        completed_at: '2026-04-09T08:15:00.000Z',
      },
      shares: [{ permission_level: 'read' }, { permission_level: 'write' }],
      responses: [
        {
          id: 'resp-1',
          submitted_at: '2026-04-02T09:00:00.000Z',
          completion: 'completed',
        },
        {
          id: 'resp-2',
          submitted_at: '2026-04-03T09:00:00.000Z',
          completion: 'partial',
        },
      ],
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
    expect(payload.kpis).toHaveLength(4);
    expect(payload.kpis[0].label).toBe('Total responses');
    expect(payload.kpis[1].label).toBe('Last synced');
    expect(payload.questions[0].label).toContain('completion');
    expect(payload.questions[0].distribution[0].value).toBe(1);
  });
});

import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from '../../../server/config';
import { registerPrincipalPlugin } from '../../../server/principal';
import { registerGoogleAuthRoutes } from './google-auth.route';
import type { GoogleAuthService } from './google-auth.service';

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

async function buildApp(service: GoogleAuthService) {
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
  await registerGoogleAuthRoutes(app, { service });

  return { app, config };
}

describe('google auth provider routes', () => {
  it('returns 401 for start and callback without access token', async () => {
    const service: GoogleAuthService = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn(),
    };
    const { app } = await buildApp(service);

    const [start, callback] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/providers/google/auth/start',
        payload: {
          redirectUri: 'https://app.example.com/providers/google/callback',
          codeChallenge: 'challenge-abc',
          codeChallengeMethod: 'S256',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/providers/google/auth/callback',
        payload: {
          code: 'auth-code',
          state: 'state-1',
          codeVerifier: 'verifier-1',
          redirectUri: 'https://app.example.com/providers/google/callback',
        },
      }),
    ]);

    expect(start.statusCode).toBe(401);
    expect(callback.statusCode).toBe(401);
  });

  it('starts google auth and returns provider authorization url', async () => {
    const service: GoogleAuthService = {
      startAuthorization: vi.fn(async () => ({
        provider: 'google',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
        state: 'state-1',
        codeChallengeMethod: 'S256',
      })),
      completeAuthorization: vi.fn(),
    };
    const { app, config } = await buildApp(service);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'POST',
      url: '/providers/google/auth/start',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        redirectUri: 'https://app.example.com/providers/google/callback',
        codeChallenge: 'challenge-abc',
        codeChallengeMethod: 'S256',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(service.startAuthorization).toHaveBeenCalledWith({
      principal: {
        userId: 'user-one',
        orgId: 'default-org',
      },
      input: {
        redirectUri: 'https://app.example.com/providers/google/callback',
        codeChallenge: 'challenge-abc',
        codeChallengeMethod: 'S256',
      },
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('completes google auth callback and returns linked connection summary', async () => {
    const service: GoogleAuthService = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn(async () => ({
        id: 'conn-1',
        type: 'google',
        name: 'Google Forms Account',
        externalId: 'google-user-1',
        ownerId: 'user-one',
        syncStatus: 'idle',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    };
    const { app, config } = await buildApp(service);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'POST',
      url: '/providers/google/auth/callback',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        code: 'auth-code',
        state: 'state-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'https://app.example.com/providers/google/callback',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(service.completeAuthorization).toHaveBeenCalledWith({
      principal: {
        userId: 'user-one',
        orgId: 'default-org',
      },
      input: {
        code: 'auth-code',
        state: 'state-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'https://app.example.com/providers/google/callback',
      },
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe('conn-1');
    expect(payload.data.type).toBe('google');
  });

  it('rejects callback payload with legacy externalAccountId field', async () => {
    const service: GoogleAuthService = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn(),
    };
    const { app, config } = await buildApp(service);
    const token = await signAccessToken(config);

    const response = await app.inject({
      method: 'POST',
      url: '/providers/google/auth/callback',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        code: 'auth-code',
        state: 'state-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'https://app.example.com/providers/google/callback',
        externalAccountId: 'legacy-client-value',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.completeAuthorization).not.toHaveBeenCalled();
  });
});

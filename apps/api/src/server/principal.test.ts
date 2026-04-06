import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { registerPrincipalPlugin, getPrincipal } from './principal';
import type { Config } from './config';

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

async function signAccessToken(config: Config, principal: { userId: string; orgId: string }) {
  const secret = new TextEncoder().encode(config.AUTH_JWT_SECRET);

  return new SignJWT({ org: principal.orgId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.userId)
    .setIssuer(config.OIDC_ISSUER)
    .setAudience(config.OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

describe('registerPrincipalPlugin', () => {
  it('extracts a principal from a valid bearer token', async () => {
    const config = buildConfig();
    const app = Fastify();

    app.setErrorHandler((error, _request, reply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      return reply.code(statusCode).send({
        success: false,
        error: {
          code: 'unauthorized',
          message: error.message,
        },
      });
    });

    await registerPrincipalPlugin(app, config);

    app.get('/principal', async (request) => {
      return getPrincipal(request);
    });

    const token = await signAccessToken(config, {
      userId: 'user-123',
      orgId: 'org-456',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/principal',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: 'user-123',
      orgId: 'org-456',
      token,
    });
  });

  it('rejects missing or invalid bearer tokens', async () => {
    const config = buildConfig();
    const app = Fastify();

    app.setErrorHandler((error, _request, reply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      return reply.code(statusCode).send({
        success: false,
        error: {
          code: 'unauthorized',
          message: error.message,
        },
      });
    });

    await registerPrincipalPlugin(app, config);

    app.get('/principal', async (request) => {
      return getPrincipal(request);
    });

    const missingToken = await app.inject({
      method: 'GET',
      url: '/principal',
    });

    const invalidToken = await app.inject({
      method: 'GET',
      url: '/principal',
      headers: {
        authorization: 'Bearer not-a-valid-token',
      },
    });

    expect(missingToken.statusCode).toBe(401);
    expect(invalidToken.statusCode).toBe(401);
  });
});

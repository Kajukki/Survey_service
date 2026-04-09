import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Config } from '../../server/config';
import type {
  AuthRepository,
  AuthUserRecord,
  AuthRefreshTokenRecord,
  RefreshTokenWithUser,
} from './auth.repository';
import { createAuthService, hashPassword, hashRefreshToken } from './auth.service';

class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly tokens = new Map<string, AuthRefreshTokenRecord>();

  async findUserByUsername(username: string): Promise<AuthUserRecord | null> {
    return this.users.get(username) ?? null;
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
    orgId: string;
  }): Promise<AuthUserRecord> {
    const user: AuthUserRecord = {
      id: randomUUID(),
      username: input.username,
      passwordHash: input.passwordHash,
      orgId: input.orgId,
    };
    this.users.set(user.username, user);
    return user;
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthRefreshTokenRecord> {
    const token: AuthRefreshTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.tokens.set(token.id, token);
    return token;
  }

  async findActiveRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null> {
    const token = Array.from(this.tokens.values()).find(
      (entry) => entry.tokenHash === tokenHash && !entry.revokedAt && entry.expiresAt > new Date(),
    );

    if (!token) {
      return null;
    }

    const user = Array.from(this.users.values()).find((entry) => entry.id === token.userId);
    if (!user) {
      return null;
    }

    return {
      token,
      user,
    };
  }

  async revokeRefreshToken(id: string): Promise<void> {
    const token = this.tokens.get(id);
    if (!token) {
      return;
    }

    this.tokens.set(id, {
      ...token,
      revokedAt: new Date(),
    });
  }

  seedUser(username: string, password: string): AuthUserRecord {
    const user = {
      id: randomUUID(),
      username,
      passwordHash: hashPassword(password),
      orgId: 'default-org',
    };
    this.users.set(username, user);
    return user;
  }
}

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

describe('createAuthService', () => {
  it('registers a user and issues auth tokens', async () => {
    const repository = new InMemoryAuthRepository();
    const service = createAuthService({
      repository,
      config: buildConfig(),
    });

    const session = await service.register({
      username: 'userOne',
      password: 'passwordOne',
    });

    expect(session.user.username).toBe('userOne');
    expect(session.accessToken.length).toBeGreaterThan(20);
    expect(session.refreshToken.length).toBeGreaterThan(20);
  });

  it('logs in existing users and rotates refresh tokens on refresh', async () => {
    const repository = new InMemoryAuthRepository();
    repository.seedUser('userOne', 'passwordOne');

    const service = createAuthService({
      repository,
      config: buildConfig(),
    });

    const session = await service.login({
      username: 'userOne',
      password: 'passwordOne',
    });

    const refreshed = await service.refresh(session.refreshToken);

    expect(refreshed.user.username).toBe('userOne');
    expect(hashRefreshToken(refreshed.refreshToken)).not.toBe(
      hashRefreshToken(session.refreshToken),
    );
  });
});

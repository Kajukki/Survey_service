import { describe, expect, it, vi } from 'vitest';
import {
  createGoogleAuthService,
  createInMemoryConnectionStore,
  createInMemoryStateStore,
} from './google-auth.service';

describe('GoogleAuthService', () => {
  it('starts and completes auth with a valid PKCE verifier', async () => {
    const stateStore = createInMemoryStateStore();
    const connectionStore = createInMemoryConnectionStore();

    const connector = {
      buildAuthorizationUrl: vi.fn((input: any) => ({
        provider: 'google',
        authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}`,
        state: input.state,
        codeChallengeMethod: 'S256',
      })),
      exchangeAuthorizationCode: vi.fn(async () => ({
        tokenSet: {
          provider: 'google',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-01-01T00:00:00.000Z',
          scope: 'forms.body.readonly',
          tokenType: 'Bearer',
        },
        externalAccountId: 'google-subject-1',
        idToken: 'google-id-token',
      })),
    };

    const service = createGoogleAuthService({
      connector,
      stateStore,
      connectionStore,
    });

    const codeVerifier = 'abc123';
    const codeChallenge = 'bKE9UspwyIPg8LsQHkJaiehiTeUdstI5JZOvaoQRgJA';

    const start = await service.startAuthorization({
      principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
      input: {
        redirectUri: 'https://app.example.com/providers/google/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
      },
    });

    const linked = await service.completeAuthorization({
      principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
      input: {
        code: 'auth-code',
        state: start.state,
        codeVerifier,
        redirectUri: 'https://app.example.com/providers/google/callback',
      },
    });

    expect(start.provider).toBe('google');
    expect(linked.type).toBe('google');
    expect(linked.externalId).toBe('google-subject-1');
    expect(connector.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  it('rejects callback when PKCE verifier does not match state challenge', async () => {
    const stateStore = createInMemoryStateStore();
    const connectionStore = createInMemoryConnectionStore();

    const connector = {
      buildAuthorizationUrl: vi.fn((input: any) => ({
        provider: 'google',
        authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}`,
        state: input.state,
        codeChallengeMethod: 'S256',
      })),
      exchangeAuthorizationCode: vi.fn(),
    };

    const service = createGoogleAuthService({
      connector,
      stateStore,
      connectionStore,
    });

    const start = await service.startAuthorization({
      principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
      input: {
        redirectUri: 'https://app.example.com/providers/google/callback',
        codeChallenge: 'valid-challenge-value',
        codeChallengeMethod: 'S256',
      },
    });

    await expect(
      service.completeAuthorization({
        principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
        input: {
          code: 'auth-code',
          state: start.state,
          codeVerifier: 'wrong-verifier',
          redirectUri: 'https://app.example.com/providers/google/callback',
        },
      }),
    ).rejects.toMatchObject({
      code: 'bad_request',
      statusCode: 400,
    });
  });

  it('rejects callback reuse after state is consumed once', async () => {
    const stateStore = createInMemoryStateStore();
    const connectionStore = createInMemoryConnectionStore();

    const connector = {
      buildAuthorizationUrl: vi.fn((input: any) => ({
        provider: 'google',
        authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}`,
        state: input.state,
        codeChallengeMethod: 'S256',
      })),
      exchangeAuthorizationCode: vi.fn(async () => ({
        tokenSet: {
          provider: 'google',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-01-01T00:00:00.000Z',
          scope: 'forms.body.readonly',
          tokenType: 'Bearer',
        },
        externalAccountId: 'google-subject-1',
        idToken: 'google-id-token',
      })),
    };

    const service = createGoogleAuthService({
      connector,
      stateStore,
      connectionStore,
    });

    const codeVerifier = 'abc123';
    const codeChallenge = 'bKE9UspwyIPg8LsQHkJaiehiTeUdstI5JZOvaoQRgJA';

    const start = await service.startAuthorization({
      principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
      input: {
        redirectUri: 'https://app.example.com/providers/google/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
      },
    });

    await service.completeAuthorization({
      principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
      input: {
        code: 'auth-code',
        state: start.state,
        codeVerifier,
        redirectUri: 'https://app.example.com/providers/google/callback',
      },
    });

    await expect(
      service.completeAuthorization({
        principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
        input: {
          code: 'auth-code',
          state: start.state,
          codeVerifier,
          redirectUri: 'https://app.example.com/providers/google/callback',
        },
      }),
    ).rejects.toMatchObject({
      code: 'bad_request',
      statusCode: 400,
    });
  });

  it('rejects start authorization when request includes disallowed scopes', async () => {
    const stateStore = createInMemoryStateStore();
    const connectionStore = createInMemoryConnectionStore();

    const connector = {
      buildAuthorizationUrl: vi.fn(),
      exchangeAuthorizationCode: vi.fn(),
    };

    const service = createGoogleAuthService({
      connector,
      stateStore,
      connectionStore,
      allowedScopes: ['https://www.googleapis.com/auth/forms.body.readonly'],
    });

    await expect(
      service.startAuthorization({
        principal: { userId: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f', orgId: 'default-org' },
        input: {
          redirectUri: 'https://app.example.com/providers/google/callback',
          codeChallenge: 'bKE9UspwyIPg8LsQHkJaiehiTeUdstI5JZOvaoQRgJA',
          codeChallengeMethod: 'S256',
          scopes: [
            'https://www.googleapis.com/auth/forms.body.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'bad_request',
      statusCode: 400,
    });
  });
});

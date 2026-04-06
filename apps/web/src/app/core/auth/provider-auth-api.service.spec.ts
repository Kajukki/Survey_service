import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createProviderAuthClient, type ProviderAuthHttpClient } from './provider-auth.client';

describe('ProviderAuthApiService client', () => {
  it('posts google auth start payload and returns authorization result', async () => {
    const http: ProviderAuthHttpClient = {
      post: vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            provider: 'google',
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1',
            state: 'state-1',
            codeChallengeMethod: 'S256',
          },
        }),
      ),
    };

    const client = createProviderAuthClient(http, '/api/v1');
    const result = await client.startGoogleAuth({
      redirectUri: 'https://app.example.com/auth/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      scopes: ['scope-a'],
    });

    expect(http.post).toHaveBeenCalledWith('/api/v1/providers/google/auth/start', {
      redirectUri: 'https://app.example.com/auth/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      scopes: ['scope-a'],
    });

    expect(result.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(result.state).toBe('state-1');
  });

  it('posts google auth callback payload and returns linked connection', async () => {
    const http: ProviderAuthHttpClient = {
      post: vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            id: 'conn-1',
            type: 'google',
            name: 'Google Forms Connection',
            externalId: 'google-user-user-1',
            ownerId: 'user-1',
            syncStatus: 'idle',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
        }),
      ),
    };

    const client = createProviderAuthClient(http, '/api/v1');
    const result = await client.completeGoogleAuthCallback({
      code: 'oauth-code',
      state: 'oauth-state',
      codeVerifier: 'code-verifier',
      redirectUri: 'https://app.example.com/auth/callback',
    });

    expect(http.post).toHaveBeenCalledWith('/api/v1/providers/google/auth/callback', {
      code: 'oauth-code',
      state: 'oauth-state',
      codeVerifier: 'code-verifier',
      redirectUri: 'https://app.example.com/auth/callback',
    });

    expect(result.id).toBe('conn-1');
    expect(result.type).toBe('google');
  });

  it('throws envelope message for unsuccessful start response', async () => {
    const http: ProviderAuthHttpClient = {
      post: vi.fn().mockReturnValue(
        of({
          success: false,
          error: {
            code: 'validation_error',
            message: 'Invalid OAuth payload',
          },
        }),
      ),
    };

    const client = createProviderAuthClient(http, '/api/v1');

    await expect(
      client.startGoogleAuth({
        redirectUri: 'https://app.example.com/auth/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      }),
    ).rejects.toThrow('Invalid OAuth payload');
  });
});

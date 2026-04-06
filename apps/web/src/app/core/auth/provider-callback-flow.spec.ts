import { describe, expect, it, vi } from 'vitest';

import { resolveAuthCallbackNavigation } from './provider-callback-flow';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('resolveAuthCallbackNavigation', () => {
  it('keeps existing app session callback behavior', async () => {
    const session = {
      handleAuthCallback: vi.fn(),
    };

    const destination = await resolveAuthCallbackNavigation({
      callbackUrl: 'https://example.test/auth/callback?token=abc123',
      origin: 'https://example.test',
      storage: new MemoryStorage(),
      session,
      providerAuthApi: {
        completeGoogleAuthCallback: vi.fn(),
      },
    });

    expect(session.handleAuthCallback).toHaveBeenCalledWith(
      'https://example.test/auth/callback?token=abc123',
    );
    expect(destination).toBe('/dashboard');
  });

  it('completes provider callback and routes to success status', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'survey-service.google-oauth.pending',
      JSON.stringify({
        state: 'oauth-state',
        codeVerifier: 'code-verifier',
        redirectUri: 'https://example.test/auth/callback',
        expiresAt: Date.now() + 60_000,
      }),
    );

    const completeGoogleAuthCallback = vi.fn(async () => ({ id: 'conn-1' }));

    const destination = await resolveAuthCallbackNavigation({
      callbackUrl: 'https://example.test/auth/callback?code=oauth-code&state=oauth-state',
      origin: 'https://example.test',
      storage,
      session: {
        handleAuthCallback: vi.fn(),
      },
      providerAuthApi: {
        completeGoogleAuthCallback,
      },
    });

    expect(completeGoogleAuthCallback).toHaveBeenCalledWith({
      code: 'oauth-code',
      state: 'oauth-state',
      codeVerifier: 'code-verifier',
      redirectUri: 'https://example.test/auth/callback',
    });
    expect(destination).toBe('/connections?oauth=linked');
  });

  it('routes to error status when provider callback state is invalid', async () => {
    const destination = await resolveAuthCallbackNavigation({
      callbackUrl: 'https://example.test/auth/callback?code=oauth-code&state=oauth-state',
      origin: 'https://example.test',
      storage: new MemoryStorage(),
      session: {
        handleAuthCallback: vi.fn(),
      },
      providerAuthApi: {
        completeGoogleAuthCallback: vi.fn(),
      },
    });

    expect(destination).toBe('/connections?oauth=error&reason=state_mismatch');
  });
});

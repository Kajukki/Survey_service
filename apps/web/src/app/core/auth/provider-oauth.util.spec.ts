import { describe, expect, it } from 'vitest';

import {
  buildProviderCallbackUrl,
  consumePendingGoogleOAuth,
  deriveS256CodeChallenge,
  parseAuthCallback,
  savePendingGoogleOAuth,
} from './provider-oauth.util';

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

describe('provider oauth utility', () => {
  it('derives expected S256 code challenge for known verifier', async () => {
    const challenge = await deriveS256CodeChallenge('abc123');

    expect(challenge).toBe('bKE9UspwyIPg8LsQHkJaiehiTeUdstI5JZOvaoQRgJA');
  });

  it('parses application session token callback', () => {
    const result = parseAuthCallback('https://example.test/auth/callback?token=abc123');

    expect(result.kind).toBe('session-token');
    if (result.kind === 'session-token') {
      expect(result.token).toBe('abc123');
    }
  });

  it('parses provider callback code and state', () => {
    const result = parseAuthCallback(
      'https://example.test/auth/callback?code=oauth-code&state=oauth-state',
    );

    expect(result).toEqual({
      kind: 'provider-callback',
      code: 'oauth-code',
      state: 'oauth-state',
    });
  });

  it('stores and consumes pending oauth context once', () => {
    const storage = new MemoryStorage();
    const now = 1_710_000_000_000;

    savePendingGoogleOAuth(
      storage,
      {
        state: 'oauth-state',
        codeVerifier: 'verifier-value',
        redirectUri: 'https://example.test/auth/callback',
      },
      {
        now,
        ttlMs: 60_000,
      },
    );

    const consumed = consumePendingGoogleOAuth(storage, {
      expectedState: 'oauth-state',
      now: now + 30_000,
    });

    expect(consumed).toEqual({
      state: 'oauth-state',
      codeVerifier: 'verifier-value',
      redirectUri: 'https://example.test/auth/callback',
    });

    expect(
      consumePendingGoogleOAuth(storage, {
        expectedState: 'oauth-state',
        now: now + 30_000,
      }),
    ).toBeNull();
  });

  it('rejects expired oauth state', () => {
    const storage = new MemoryStorage();
    const now = 1_710_000_000_000;

    savePendingGoogleOAuth(
      storage,
      {
        state: 'oauth-state',
        codeVerifier: 'verifier-value',
        redirectUri: 'https://example.test/auth/callback',
      },
      {
        now,
        ttlMs: 60_000,
      },
    );

    const consumed = consumePendingGoogleOAuth(storage, {
      expectedState: 'oauth-state',
      now: now + 61_000,
    });

    expect(consumed).toBeNull();
  });

  it('builds provider callback url with status', () => {
    expect(buildProviderCallbackUrl('linked')).toBe('/connections?oauth=linked');
    expect(buildProviderCallbackUrl('error', 'state_mismatch')).toBe(
      '/connections?oauth=error&reason=state_mismatch',
    );
  });
});

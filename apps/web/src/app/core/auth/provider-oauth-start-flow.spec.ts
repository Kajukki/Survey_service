import { describe, expect, it, vi } from 'vitest';

import { startGoogleOAuthFlow } from './provider-oauth-start-flow';

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

describe('startGoogleOAuthFlow', () => {
  it('stores pending oauth context using state returned by API start endpoint', async () => {
    const storage = new MemoryStorage();
    const startGoogleAuth = vi.fn(async () => ({
      provider: 'google' as const,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=api-state',
      state: 'api-state',
      codeChallengeMethod: 'S256' as const,
    }));

    const result = await startGoogleOAuthFlow({
      origin: 'https://example.test',
      storage,
      startGoogleAuth,
      createVerifier: () => 'abc123',
    });

    const pendingRaw = storage.getItem('survey-service.google-oauth.pending');
    expect(pendingRaw).not.toBeNull();
    const pending = JSON.parse(pendingRaw ?? '{}') as { state?: string; codeVerifier?: string };

    expect(pending.state).toBe('api-state');
    expect(pending.codeVerifier).toBe('abc123');
    expect(result.authorizationUrl).toContain('accounts.google.com');
  });
});

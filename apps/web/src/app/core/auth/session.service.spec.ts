import { describe, expect, it, beforeEach } from 'vitest';

import { SessionService } from './session.service';

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

describe('SessionService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  });

  it('starts unauthenticated when token is absent', () => {
    const service = new SessionService();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('stores a full session payload and clears on logout', () => {
    const service = new SessionService();

    service.beginSession({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 60,
      user: {
        id: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f',
        username: 'userOne',
        orgId: 'default-org',
      },
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('access-token');
    expect(service.refreshToken()).toBe('refresh-token');
    expect(service.user()?.username).toBe('userOne');

    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('updates access token from callback when a session already exists', () => {
    const service = new SessionService();
    service.beginSession({
      accessToken: 'stale-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 60,
      user: {
        id: 'de2ddde8-ffdd-4eb9-8930-c71f6653f77f',
        username: 'userOne',
        orgId: 'default-org',
      },
    });

    service.handleAuthCallback('https://example.test/auth/callback?token=abc123');

    expect(service.token()).toBe('abc123');
    expect(service.isAuthenticated()).toBe(true);
  });
});

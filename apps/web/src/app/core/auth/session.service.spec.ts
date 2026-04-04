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

  it('sets a token on login and clears on logout', () => {
    const service = new SessionService();

    service.login();
    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('demo-token');

    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('stores callback token from query string', () => {
    const service = new SessionService();

    service.handleAuthCallback('https://example.test/auth/callback?token=abc123');

    expect(service.token()).toBe('abc123');
    expect(service.isAuthenticated()).toBe(true);
  });
});

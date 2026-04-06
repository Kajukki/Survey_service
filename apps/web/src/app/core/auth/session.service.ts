import { computed, Injectable, signal } from '@angular/core';

const SESSION_KEY = 'survey-service.session';

export interface AuthSessionUser {
  id: string;
  username: string;
  orgId: string;
}

export interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthSessionUser;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthSessionUser;
}

function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt || !parsed.user) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly session = signal<StoredSession | null>(
    parseStoredSession(localStorage.getItem(SESSION_KEY)),
  );

  readonly isAuthenticated = computed(() => {
    const active = this.session();
    return Boolean(active && active.expiresAt > Date.now());
  });

  readonly token = computed(() => this.session()?.accessToken ?? null);

  readonly refreshToken = computed(() => this.session()?.refreshToken ?? null);

  readonly user = computed(() => this.session()?.user ?? null);

  beginSession(payload: AuthSessionPayload): void {
    const stored: StoredSession = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: Date.now() + payload.expiresIn * 1000,
      user: payload.user,
    };

    this.setSession(stored);
  }

  updateTokens(payload: AuthSessionPayload): void {
    this.beginSession(payload);
  }

  logout(): void {
    this.setSession(null);
  }

  handleAuthCallback(url: string): void {
    const callbackUrl = new URL(url);
    const token = callbackUrl.searchParams.get('token') ?? callbackUrl.hash.replace('#token=', '');
    if (token) {
      const current = this.session();
      if (!current) {
        return;
      }

      this.setSession({
        ...current,
        accessToken: token,
      });
    }
  }

  private setSession(next: StoredSession | null): void {
    this.session.set(next);
    if (next) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return;
    }

    localStorage.removeItem(SESSION_KEY);
  }
}

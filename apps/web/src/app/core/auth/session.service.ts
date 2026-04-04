import { computed, Injectable, signal } from '@angular/core';

const ACCESS_TOKEN_KEY = 'survey-service.accessToken';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly accessToken = signal<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));

  readonly isAuthenticated = computed(() => Boolean(this.accessToken()));

  readonly token = computed(() => this.accessToken());

  login(): void {
    this.setToken('demo-token');
  }

  logout(): void {
    this.setToken(null);
  }

  handleAuthCallback(url: string): void {
    const callbackUrl = new URL(url);
    const token = callbackUrl.searchParams.get('token') ?? callbackUrl.hash.replace('#token=', '');
    if (token) {
      this.setToken(token);
    }
  }

  private setToken(token: string | null): void {
    this.accessToken.set(token);
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
      return;
    }

    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

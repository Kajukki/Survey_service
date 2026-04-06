import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { API_BASE_URL } from '../api/api-config.token';
import type { ApiEnvelope, ApiSuccessEnvelope } from '../api/api-envelope';
import type { AuthSessionPayload } from './session.service';

interface AuthCredentials {
  username: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  async register(payload: AuthCredentials): Promise<AuthSessionPayload> {
    return this.postSession('/auth/register', payload);
  }

  async login(payload: AuthCredentials): Promise<AuthSessionPayload> {
    return this.postSession('/auth/login', payload);
  }

  async refresh(refreshToken: string): Promise<AuthSessionPayload> {
    return this.postSession('/auth/refresh', { refreshToken });
  }

  private async postSession(path: string, body: unknown): Promise<AuthSessionPayload> {
    return firstValueFrom(
      this.http.post<ApiEnvelope<AuthSessionPayload>>(`${this.apiBaseUrl}${path}`, body).pipe(
        map((envelope) => {
          if (!envelope.success) {
            throw new Error(envelope.error.message);
          }

          return (envelope as ApiSuccessEnvelope<AuthSessionPayload>).data;
        }),
      ),
    );
  }
}

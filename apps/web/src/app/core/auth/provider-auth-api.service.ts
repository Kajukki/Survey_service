import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_BASE_URL } from '../api/api-config.token';
import {
  createProviderAuthClient,
  type GoogleAuthCallbackInput,
  type GoogleAuthStartInput,
  type GoogleAuthStartResult,
  type LinkedGoogleConnection,
} from './provider-auth.client';

export type {
  GoogleAuthCallbackInput,
  GoogleAuthStartInput,
  GoogleAuthStartResult,
  LinkedGoogleConnection,
} from './provider-auth.client';

@Injectable({ providedIn: 'root' })
export class ProviderAuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly client = createProviderAuthClient(this.http, this.apiBaseUrl);

  startGoogleAuth(input: GoogleAuthStartInput): Promise<GoogleAuthStartResult> {
    return this.client.startGoogleAuth(input);
  }

  completeGoogleAuthCallback(input: GoogleAuthCallbackInput): Promise<LinkedGoogleConnection> {
    return this.client.completeGoogleAuthCallback(input);
  }
}

import { firstValueFrom, map, Observable } from 'rxjs';

import type { ApiEnvelope, ApiSuccessEnvelope } from '../api/api-envelope';

export interface GoogleAuthStartInput {
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scopes?: string[];
}

export interface GoogleAuthStartResult {
  provider: 'google';
  authorizationUrl: string;
  state: string;
  codeChallengeMethod: 'S256';
}

export interface GoogleAuthCallbackInput {
  code: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface LinkedGoogleConnection {
  id: string;
  type: 'google';
  name: string;
  externalId: string;
  ownerId: string;
  syncStatus: 'idle';
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAuthHttpClient {
  post<T>(url: string, body: unknown): Observable<ApiEnvelope<T>>;
}

interface ProviderAuthClient {
  startGoogleAuth(input: GoogleAuthStartInput): Promise<GoogleAuthStartResult>;
  completeGoogleAuthCallback(input: GoogleAuthCallbackInput): Promise<LinkedGoogleConnection>;
}

function toApiData<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.success) {
    throw new Error(envelope.error.message);
  }

  return (envelope as ApiSuccessEnvelope<T>).data;
}

export function createProviderAuthClient(
  http: ProviderAuthHttpClient,
  apiBaseUrl: string,
): ProviderAuthClient {
  return {
    async startGoogleAuth(input: GoogleAuthStartInput): Promise<GoogleAuthStartResult> {
      return firstValueFrom(
        http
          .post<GoogleAuthStartResult>(`${apiBaseUrl}/providers/google/auth/start`, input)
          .pipe(map(toApiData)),
      );
    },

    async completeGoogleAuthCallback(
      input: GoogleAuthCallbackInput,
    ): Promise<LinkedGoogleConnection> {
      return firstValueFrom(
        http
          .post<LinkedGoogleConnection>(`${apiBaseUrl}/providers/google/auth/callback`, input)
          .pipe(map(toApiData)),
      );
    },
  };
}

import type {
  ProviderAuthStartInput,
  ProviderAuthStartResult,
  ProviderFormResponsePage,
  ProviderFormSummary,
  ProviderTokenSet,
} from '@survey-service/contracts';

export interface ProviderConnector {
  readonly provider: 'google' | 'microsoft';
  buildAuthorizationUrl(input: ProviderAuthStartInput): ProviderAuthStartResult;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<ProviderTokenSet>;
  refreshAccessToken(input: { refreshToken: string }): Promise<ProviderTokenSet>;
  listForms(input: { accessToken: string; pageToken?: string }): Promise<{
    items: ProviderFormSummary[];
    nextPageToken?: string;
  }>;
  listFormResponses(input: {
    accessToken: string;
    externalFormId: string;
    pageToken?: string;
  }): Promise<ProviderFormResponsePage>;
}

export interface ConnectorHttpClient {
  request<T>(input: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
    body?: unknown;
  }): Promise<T>;
}

import type {
  ProviderAuthStartInput,
  ProviderAuthStartResult,
  ProviderFormResponsePage,
  ProviderFormSummary,
  ProviderTokenSet,
} from '@survey-service/contracts';
import { OAuth2Client } from 'google-auth-library';
import {
  ProviderAuthStartResultSchema,
  ProviderErrorSchema,
  ProviderFormResponsePageSchema,
  ProviderFormSummarySchema,
  ProviderTokenSetSchema,
} from '@survey-service/contracts';
import type { ConnectorHttpClient, ProviderConnector } from '../types.js';

export interface GoogleConnectorConfig {
  clientId: string;
  clientSecret?: string;
  authBaseUrl: string;
  tokenUrl: string;
  formsApiBaseUrl: string;
}

interface GoogleOAuthCredentials {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
}

interface GoogleOAuthClient {
  generateAuthUrl(input: {
    access_type: 'offline';
    prompt: 'consent';
    response_type: 'code';
    redirect_uri: string;
    scope: string[];
    state: string;
    code_challenge: string;
    code_challenge_method: 'S256';
  }): string;
  getToken(input: {
    code: string;
    redirect_uri: string;
    codeVerifier: string;
  }): Promise<{ tokens: GoogleOAuthCredentials }>;
  setCredentials(input: { refresh_token: string }): void;
  refreshAccessToken(): Promise<{ credentials: GoogleOAuthCredentials }>;
}

interface GoogleHttpLikeError {
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
}

function toErrorCode(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return 'unknown_error';
  }

  return input.trim().toLowerCase();
}

function isRetryableStatus(status?: number): boolean {
  if (typeof status !== 'number') {
    return false;
  }

  return status === 429 || status >= 500;
}

export function mapGoogleProviderError(error: unknown, provider: 'google' = 'google') {
  const candidate = error as GoogleHttpLikeError;
  const status = candidate.response?.status;
  const payload = candidate.response?.data as
    | {
        error?:
          | string
          | {
              status?: string;
              message?: string;
            };
        error_description?: string;
      }
    | undefined;

  let code = 'unknown_error';
  let message = candidate.message ?? 'Google connector request failed';

  if (typeof payload?.error === 'string') {
    code = toErrorCode(payload.error);
    message = payload.error_description ?? message;
  } else if (payload?.error && typeof payload.error === 'object') {
    code = toErrorCode(payload.error.status);
    message = payload.error.message ?? message;
  }

  return ProviderErrorSchema.parse({
    provider,
    code,
    message,
    retryable: isRetryableStatus(status),
    status,
  });
}

function createGoogleOAuthClient(config: GoogleConnectorConfig): GoogleOAuthClient {
  const client = new OAuth2Client(config.clientId, config.clientSecret);

  return {
    generateAuthUrl(input) {
      return client.generateAuthUrl(input as any);
    },
    async getToken(input) {
      const response = await client.getToken(input);
      return {
        tokens: response.tokens,
      };
    },
    setCredentials(input) {
      client.setCredentials(input);
    },
    async refreshAccessToken() {
      const response = await client.refreshAccessToken();
      return {
        credentials: response.credentials,
      };
    },
  };
}

export class GoogleFormsConnector implements ProviderConnector {
  readonly provider = 'google' as const;

  constructor(
    private readonly config: GoogleConnectorConfig,
    private readonly httpClient: ConnectorHttpClient,
    private readonly oauthClient: GoogleOAuthClient = createGoogleOAuthClient(config),
  ) {}

  buildAuthorizationUrl(input: ProviderAuthStartInput): ProviderAuthStartResult {
    const authorizationUrl = this.oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      response_type: 'code',
      redirect_uri: input.redirectUri,
      scope: input.scopes,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: input.codeChallengeMethod,
    });

    return ProviderAuthStartResultSchema.parse({
      provider: this.provider,
      authorizationUrl,
      state: input.state,
      codeChallengeMethod: input.codeChallengeMethod,
    });
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<ProviderTokenSet> {
    try {
      const tokenResponse = await this.oauthClient.getToken({
        code: input.code,
        redirect_uri: input.redirectUri,
        codeVerifier: input.codeVerifier,
      });

      return this.toTokenSet(tokenResponse.tokens);
    } catch (error) {
      throw mapGoogleProviderError(error);
    }
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<ProviderTokenSet> {
    try {
      this.oauthClient.setCredentials({ refresh_token: input.refreshToken });
      const tokenResponse = await this.oauthClient.refreshAccessToken();

      return this.toTokenSet(tokenResponse.credentials, input.refreshToken);
    } catch (error) {
      throw mapGoogleProviderError(error);
    }
  }

  async listForms(input: { accessToken: string; pageToken?: string }): Promise<{
    items: ProviderFormSummary[];
    nextPageToken?: string;
  }> {
    try {
      const response = await this.httpClient.request<{
        forms?: Array<{
          formId: string;
          info?: {
            title?: string;
            description?: string;
            documentTitle?: string;
          };
          revisionId?: string;
        }>;
        nextPageToken?: string;
      }>({
        method: 'GET',
        url: `${this.config.formsApiBaseUrl}/forms`,
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
        query: {
          pageToken: input.pageToken,
        },
      });

      const items = (response.forms ?? []).map((form) =>
        ProviderFormSummarySchema.parse({
          provider: this.provider,
          externalFormId: form.formId,
          title: form.info?.title ?? form.info?.documentTitle ?? 'Untitled form',
          description: form.info?.description,
          responseCount: 0,
        }),
      );

      return {
        items,
        nextPageToken: response.nextPageToken,
      };
    } catch (error) {
      throw mapGoogleProviderError(error);
    }
  }

  async listFormResponses(input: {
    accessToken: string;
    externalFormId: string;
    pageToken?: string;
  }): Promise<ProviderFormResponsePage> {
    try {
      const response = await this.httpClient.request<{
        responses?: Array<{
          responseId: string;
          lastSubmittedTime?: string;
          answers?: Record<string, unknown>;
        }>;
        nextPageToken?: string;
      }>({
        method: 'GET',
        url: `${this.config.formsApiBaseUrl}/forms/${input.externalFormId}/responses`,
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
        query: {
          pageToken: input.pageToken,
        },
      });

      return ProviderFormResponsePageSchema.parse({
        provider: this.provider,
        externalFormId: input.externalFormId,
        nextPageToken: response.nextPageToken,
        responses: (response.responses ?? []).map((item) => ({
          externalResponseId: item.responseId,
          submittedAt: item.lastSubmittedTime,
          answers: item.answers ?? {},
        })),
      });
    } catch (error) {
      throw mapGoogleProviderError(error);
    }
  }

  private toTokenSet(
    tokenResponse: GoogleOAuthCredentials,
    fallbackRefreshToken?: string,
  ): ProviderTokenSet {
    const expiresAt = new Date(tokenResponse.expiry_date ?? Date.now() + 3600 * 1000).toISOString();

    return ProviderTokenSetSchema.parse({
      provider: this.provider,
      accessToken: tokenResponse.access_token ?? '',
      refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken,
      expiresAt,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type ?? 'Bearer',
    });
  }
}

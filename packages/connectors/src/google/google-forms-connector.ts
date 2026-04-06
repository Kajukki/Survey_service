import type {
  ProviderAuthStartInput,
  ProviderAuthStartResult,
  ProviderFormResponsePage,
  ProviderFormSummary,
  ProviderTokenSet,
} from '@survey-service/contracts';
import {
  ProviderAuthStartResultSchema,
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

function encodeQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export class GoogleFormsConnector implements ProviderConnector {
  readonly provider = 'google' as const;

  constructor(
    private readonly config: GoogleConnectorConfig,
    private readonly httpClient: ConnectorHttpClient,
  ) {}

  buildAuthorizationUrl(input: ProviderAuthStartInput): ProviderAuthStartResult {
    const scope = input.scopes.join(' ');
    const query = encodeQuery({
      client_id: this.config.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: input.codeChallengeMethod,
    });

    return ProviderAuthStartResultSchema.parse({
      provider: this.provider,
      authorizationUrl: `${this.config.authBaseUrl}?${query}`,
      state: input.state,
      codeChallengeMethod: input.codeChallengeMethod,
    });
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<ProviderTokenSet> {
    const tokenResponse = await this.httpClient.request<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    }>({
      method: 'POST',
      url: this.config.tokenUrl,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: encodeQuery({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret ?? '',
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    });

    return this.toTokenSet(tokenResponse);
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<ProviderTokenSet> {
    const tokenResponse = await this.httpClient.request<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    }>({
      method: 'POST',
      url: this.config.tokenUrl,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: encodeQuery({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret ?? '',
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
      }),
    });

    return this.toTokenSet(tokenResponse);
  }

  async listForms(input: { accessToken: string; pageToken?: string }): Promise<{
    items: ProviderFormSummary[];
    nextPageToken?: string;
  }> {
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
  }

  async listFormResponses(input: {
    accessToken: string;
    externalFormId: string;
    pageToken?: string;
  }): Promise<ProviderFormResponsePage> {
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
  }

  private toTokenSet(tokenResponse: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  }): ProviderTokenSet {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();

    return ProviderTokenSetSchema.parse({
      provider: this.provider,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type ?? 'Bearer',
    });
  }
}

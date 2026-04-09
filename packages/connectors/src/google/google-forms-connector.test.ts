import { describe, expect, it, vi } from 'vitest';
import {
  GoogleFormsConnector,
  mapGoogleProviderError,
  type GoogleConnectorConfig,
} from './google-forms-connector';
import type { ConnectorHttpClient } from '../types';

const config: GoogleConnectorConfig = {
  clientId: 'google-client-id',
  clientSecret: 'google-client-secret',
  authBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  formsApiBaseUrl: 'https://forms.googleapis.com/v1',
};

function makeHttpClient() {
  return {
    request: vi.fn(),
  } as unknown as ConnectorHttpClient;
}

function makeOAuthClient() {
  return {
    generateAuthUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1'),
    getToken: vi.fn(),
    verifyIdToken: vi.fn(),
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

describe('GoogleFormsConnector', () => {
  it('builds an oauth authorization URL with PKCE parameters', () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();
    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);

    const result = connector.buildAuthorizationUrl({
      provider: 'google',
      redirectUri: 'https://app.example.com/callback',
      state: 'state-123',
      codeChallenge: 'challenge-abc',
      codeChallengeMethod: 'S256',
      scopes: ['forms.body.readonly', 'forms.responses.readonly'],
    });

    expect(result.provider).toBe('google');
    expect(result.authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    expect(oauthClient.generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      prompt: 'consent',
      response_type: 'code',
      redirect_uri: 'https://app.example.com/callback',
      scope: ['forms.body.readonly', 'forms.responses.readonly'],
      state: 'state-123',
      code_challenge: 'challenge-abc',
      code_challenge_method: 'S256',
    });
  });

  it('maps token exchange response into provider token set', async () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();
    vi.mocked(oauthClient.getToken).mockResolvedValueOnce({
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
        scope: 'forms.body.readonly',
        token_type: 'Bearer',
        id_token: 'google-id-token',
      },
    });
    vi.mocked(oauthClient.verifyIdToken).mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-subject-1',
      }),
    } as any);

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);
    const result = await connector.exchangeAuthorizationCode({
      code: 'oauth-code',
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-123',
    });

    expect(result.tokenSet.provider).toBe('google');
    expect(result.tokenSet.accessToken).toBe('access-token');
    expect(result.tokenSet.refreshToken).toBe('refresh-token');
    expect(result.idToken).toBe('google-id-token');
    expect(result.externalAccountId).toBe('google-subject-1');
    expect(result.tokenSet.expiresAt.length).toBeGreaterThan(10);
    expect(oauthClient.getToken).toHaveBeenCalledWith({
      code: 'oauth-code',
      redirect_uri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-123',
    });
    expect(oauthClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'google-client-id',
    });
  });

  it('rejects token exchange when google id_token is missing', async () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();
    vi.mocked(oauthClient.getToken).mockResolvedValueOnce({
      tokens: {
        access_token: 'access-token',
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);

    await expect(
      connector.exchangeAuthorizationCode({
        code: 'oauth-code',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: 'verifier-123',
      }),
    ).rejects.toMatchObject({
      provider: 'google',
      code: 'invalid_id_token',
      retryable: false,
      status: 400,
    });
  });

  it('maps refresh token flow using oauth client refresh credentials', async () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();

    vi.mocked(oauthClient.refreshAccessToken).mockResolvedValueOnce({
      credentials: {
        access_token: 'refreshed-access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 1800 * 1000,
        scope: 'forms.body.readonly forms.responses.readonly',
        token_type: 'Bearer',
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);
    const result = await connector.refreshAccessToken({ refreshToken: 'refresh-token' });

    expect(oauthClient.setCredentials).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect(oauthClient.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('refreshed-access-token');
  });

  it('maps form list payload into provider-neutral summaries', async () => {
    const httpClient = makeHttpClient();
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      files: [
        {
          id: 'form-ext-1',
          name: 'Customer Survey',
          description: 'Quarterly pulse',
        },
      ],
      nextPageToken: 'next-page',
    });

    const connector = new GoogleFormsConnector(config, httpClient);
    const result = await connector.listForms({ accessToken: 'token' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.externalFormId).toBe('form-ext-1');
    expect(result.items[0]?.title).toBe('Customer Survey');
    expect(result.nextPageToken).toBe('next-page');
    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://www.googleapis.com/drive/v3/files',
      }),
    );
  });

  it('maps response list payload into provider-neutral response page', async () => {
    const httpClient = makeHttpClient();
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      responses: [
        {
          responseId: 'resp-1',
          lastSubmittedTime: '2026-01-01T00:00:00.000Z',
          answers: {
            q1: 'yes',
          },
        },
      ],
      nextPageToken: 'next',
    });

    const connector = new GoogleFormsConnector(config, httpClient);
    const result = await connector.listFormResponses({
      accessToken: 'token',
      externalFormId: 'form-ext-1',
    });

    expect(result.externalFormId).toBe('form-ext-1');
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]?.externalResponseId).toBe('resp-1');
    expect(result.nextPageToken).toBe('next');
  });

  it('throws mapped provider error when OAuth token exchange fails', async () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();

    vi.mocked(oauthClient.getToken).mockRejectedValueOnce({
      message: 'invalid grant',
      response: {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'Bad Request',
        },
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);

    await expect(
      connector.exchangeAuthorizationCode({
        code: 'oauth-code',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: 'verifier-123',
      }),
    ).rejects.toMatchObject({
      provider: 'google',
      code: 'invalid_grant',
      retryable: false,
      status: 400,
    });
  });

  it('throws mapped provider error when list forms API fails', async () => {
    const httpClient = makeHttpClient();
    vi.mocked(httpClient.request).mockRejectedValueOnce({
      message: 'Quota exceeded',
      response: {
        status: 429,
        data: {
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: 'Too many requests',
          },
        },
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient);

    await expect(
      connector.listForms({
        accessToken: 'token',
      }),
    ).rejects.toMatchObject({
      provider: 'google',
      code: 'resource_exhausted',
      retryable: true,
      status: 429,
    });
  });

  it('throws mapped provider error when refresh token flow fails', async () => {
    const httpClient = makeHttpClient();
    const oauthClient = makeOAuthClient();

    vi.mocked(oauthClient.refreshAccessToken).mockRejectedValueOnce({
      message: 'temporarily unavailable',
      response: {
        status: 503,
        data: {
          error: {
            status: 'UNAVAILABLE',
            message: 'Service unavailable',
          },
        },
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);

    await expect(
      connector.refreshAccessToken({ refreshToken: 'refresh-token' }),
    ).rejects.toMatchObject({
      provider: 'google',
      code: 'unavailable',
      retryable: true,
      status: 503,
    });
  });

  it('throws mapped provider error when list responses API fails', async () => {
    const httpClient = makeHttpClient();
    vi.mocked(httpClient.request).mockRejectedValueOnce({
      message: 'Internal Error',
      response: {
        status: 500,
        data: {
          error: {
            status: 'INTERNAL',
            message: 'Internal server error',
          },
        },
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient);

    await expect(
      connector.listFormResponses({
        accessToken: 'token',
        externalFormId: 'form-ext-1',
      }),
    ).rejects.toMatchObject({
      provider: 'google',
      code: 'internal',
      retryable: true,
      status: 500,
    });
  });
});

describe('mapGoogleProviderError', () => {
  it('maps google OAuth invalid_grant errors as non-retryable', () => {
    const mapped = mapGoogleProviderError(
      {
        message: 'invalid grant',
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Bad Request',
          },
        },
      },
      'google',
    );

    expect(mapped.provider).toBe('google');
    expect(mapped.code).toBe('invalid_grant');
    expect(mapped.retryable).toBe(false);
    expect(mapped.status).toBe(400);
  });

  it('maps google API 429 errors as retryable', () => {
    const mapped = mapGoogleProviderError(
      {
        message: 'Quota exceeded',
        response: {
          status: 429,
          data: {
            error: {
              status: 'RESOURCE_EXHAUSTED',
              message: 'Too many requests',
            },
          },
        },
      },
      'google',
    );

    expect(mapped.code).toBe('resource_exhausted');
    expect(mapped.retryable).toBe(true);
    expect(mapped.status).toBe(429);
  });
});

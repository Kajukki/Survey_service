import { describe, expect, it, vi } from 'vitest';
import { GoogleFormsConnector, type GoogleConnectorConfig } from './google-forms-connector';
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
      },
    });

    const connector = new GoogleFormsConnector(config, httpClient, oauthClient as any);
    const result = await connector.exchangeAuthorizationCode({
      code: 'oauth-code',
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-123',
    });

    expect(result.provider).toBe('google');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.expiresAt.length).toBeGreaterThan(10);
    expect(oauthClient.getToken).toHaveBeenCalledWith({
      code: 'oauth-code',
      redirect_uri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-123',
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
      forms: [
        {
          formId: 'form-ext-1',
          info: {
            title: 'Customer Survey',
            description: 'Quarterly pulse',
          },
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
});

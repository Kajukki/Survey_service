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

describe('GoogleFormsConnector', () => {
  it('builds an oauth authorization URL with PKCE parameters', () => {
    const httpClient = makeHttpClient();
    const connector = new GoogleFormsConnector(config, httpClient);

    const result = connector.buildAuthorizationUrl({
      provider: 'google',
      redirectUri: 'https://app.example.com/callback',
      state: 'state-123',
      codeChallenge: 'challenge-abc',
      codeChallengeMethod: 'S256',
      scopes: ['forms.body.readonly', 'forms.responses.readonly'],
    });

    expect(result.provider).toBe('google');
    expect(result.authorizationUrl).toContain('code_challenge=challenge-abc');
    expect(result.authorizationUrl).toContain('code_challenge_method=S256');
    expect(result.authorizationUrl).toContain('state=state-123');
  });

  it('maps token exchange response into provider token set', async () => {
    const httpClient = makeHttpClient();
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope: 'forms.body.readonly',
      token_type: 'Bearer',
    });

    const connector = new GoogleFormsConnector(config, httpClient);
    const result = await connector.exchangeAuthorizationCode({
      code: 'oauth-code',
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-123',
    });

    expect(result.provider).toBe('google');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.expiresAt.length).toBeGreaterThan(10);
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

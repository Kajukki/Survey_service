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
import type {
  ConnectorHttpClient,
  ProviderConnector,
  ProviderFormDefinition,
  ProviderQuestionType,
} from '../types.js';

export interface GoogleConnectorConfig {
  clientId: string;
  clientSecret?: string;
  authBaseUrl: string;
  tokenUrl: string;
  formsApiBaseUrl: string;
  driveApiBaseUrl?: string;
}

interface GoogleOAuthCredentials {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
  id_token?: string | null;
}

interface GoogleIdTokenPayload {
  sub?: string;
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
  verifyIdToken(input: {
    idToken: string;
    audience: string;
  }): Promise<{ getPayload(): GoogleIdTokenPayload | undefined }>;
  setCredentials(input: { refresh_token: string }): void;
  refreshAccessToken(): Promise<{ credentials: GoogleOAuthCredentials }>;
}

interface GoogleAuthCodeExchangeResult {
  tokenSet: ProviderTokenSet;
  idToken: string;
  externalAccountId: string;
}

interface GoogleHttpLikeError {
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
}

interface GoogleFormItem {
  itemId?: string;
  title?: string;
  description?: string;
  pageBreakItem?: Record<string, unknown>;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      choiceQuestion?: {
        type?: string;
        options?: Array<{ value?: string }>;
      };
      textQuestion?: Record<string, unknown>;
      scaleQuestion?: {
        low?: number;
        high?: number;
      };
      dateQuestion?: Record<string, unknown>;
      timeQuestion?: Record<string, unknown>;
    };
  };
}

interface GoogleFormDefinitionResponse {
  formId?: string;
  info?: {
    title?: string;
    description?: string;
  };
  items?: GoogleFormItem[];
}

type GoogleQuestionDefinition = NonNullable<NonNullable<GoogleFormItem['questionItem']>['question']>;

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

function createInvalidIdTokenProviderError(message: string) {
  return ProviderErrorSchema.parse({
    provider: 'google',
    code: 'invalid_id_token',
    message,
    retryable: false,
    status: 400,
  });
}

function isProviderErrorLike(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'provider' in error && 'code' in error && 'message' in error;
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
    async verifyIdToken(input) {
      return client.verifyIdToken({
        idToken: input.idToken,
        audience: input.audience,
      });
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
  }): Promise<GoogleAuthCodeExchangeResult> {
    try {
      const tokenResponse = await this.oauthClient.getToken({
        code: input.code,
        redirect_uri: input.redirectUri,
        codeVerifier: input.codeVerifier,
      });

      const idToken = tokenResponse.tokens.id_token?.trim();
      if (!idToken) {
        throw createInvalidIdTokenProviderError('Google token exchange response is missing id_token');
      }

      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.config.clientId,
      });

      const payload = ticket.getPayload();
      const externalAccountId = payload?.sub?.trim();
      if (!externalAccountId) {
        throw createInvalidIdTokenProviderError('Google id_token payload is missing sub claim');
      }

      return {
        tokenSet: this.toTokenSet(tokenResponse.tokens),
        idToken,
        externalAccountId,
      };
    } catch (error) {
      if (isProviderErrorLike(error)) {
        throw error;
      }

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
        files?: Array<{
          id: string;
          name?: string;
          description?: string;
        }>;
        nextPageToken?: string;
      }>({
        method: 'GET',
        url: `${this.config.driveApiBaseUrl ?? 'https://www.googleapis.com/drive/v3'}/files`,
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
        query: {
          q: "mimeType='application/vnd.google-apps.form' and trashed=false",
          fields: 'nextPageToken,files(id,name,description)',
          pageSize: '100',
          pageToken: input.pageToken,
        },
      });

      const items = (response.files ?? []).map((file) =>
        ProviderFormSummarySchema.parse({
          provider: this.provider,
          externalFormId: file.id,
          title: file.name ?? 'Untitled form',
          description: file.description,
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

  async getFormDefinition(input: {
    accessToken: string;
    externalFormId: string;
  }): Promise<ProviderFormDefinition> {
    try {
      const response = await this.httpClient.request<GoogleFormDefinitionResponse>({
        method: 'GET',
        url: `${this.config.formsApiBaseUrl}/forms/${input.externalFormId}`,
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
      });

      const defaultSectionId = 'section-0';
      const sections: ProviderFormDefinition['sections'] = [
        {
          id: defaultSectionId,
          title: 'General',
          order: 0,
        },
      ];

      const questions: ProviderFormDefinition['questions'] = [];
      let currentSectionId = defaultSectionId;
      let sectionOrder = 1;
      let questionOrder = 0;

      for (const item of response.items ?? []) {
        if (item.pageBreakItem) {
          const sectionId = item.itemId?.trim() || `section-${sectionOrder}`;
          sections.push({
            id: sectionId,
            title: item.title?.trim() || `Section ${sectionOrder + 1}`,
            description: item.description?.trim() || undefined,
            order: sectionOrder,
          });
          currentSectionId = sectionId;
          sectionOrder += 1;
          continue;
        }

        const question = item.questionItem?.question;
        const questionId = question?.questionId?.trim();
        if (!question || !questionId) {
          continue;
        }

        const mappedType = this.mapQuestionType(question);
        const options =
          question.choiceQuestion?.options
            ?.map((option) => option.value?.trim())
            .filter((value): value is string => Boolean(value && value.length > 0))
            .map((value) => ({ value, label: value })) ?? [];

        questions.push({
          id: questionId,
          sectionId: currentSectionId,
          label: item.title?.trim() || questionId,
          description: item.description?.trim() || undefined,
          required: Boolean(question.required),
          type: mappedType,
          order: questionOrder,
          ...(options.length > 0 ? { options } : {}),
        });

        questionOrder += 1;
      }

      return {
        provider: this.provider,
        externalFormId: response.formId?.trim() || input.externalFormId,
        title: response.info?.title?.trim() || 'Untitled form',
        description: response.info?.description?.trim() || undefined,
        sections,
        questions,
      };
    } catch (error) {
      throw mapGoogleProviderError(error);
    }
  }

  private mapQuestionType(question: GoogleQuestionDefinition): ProviderQuestionType {
    const choiceType = question.choiceQuestion?.type;
    if (choiceType === 'CHECKBOX') {
      return 'multi_choice';
    }

    if (choiceType === 'RADIO' || choiceType === 'DROP_DOWN') {
      return 'single_choice';
    }

    if (question.scaleQuestion) {
      return 'rating';
    }

    if (question.dateQuestion || question.timeQuestion) {
      return 'date';
    }

    return 'text';
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

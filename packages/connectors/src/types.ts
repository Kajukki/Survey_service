import type {
  ProviderAuthStartInput,
  ProviderAuthStartResult,
  ProviderFormResponsePage,
  ProviderFormSummary,
  ProviderTokenSet,
} from '@survey-service/contracts';

export type ProviderQuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'text'
  | 'rating'
  | 'date'
  | 'number';

export interface ProviderFormSectionDefinition {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface ProviderFormQuestionOptionDefinition {
  value: string;
  label: string;
}

export interface ProviderFormQuestionDefinition {
  id: string;
  sectionId?: string;
  label: string;
  description?: string;
  required: boolean;
  type: ProviderQuestionType;
  order: number;
  options?: ProviderFormQuestionOptionDefinition[];
}

export interface ProviderFormDefinition {
  provider: 'google' | 'microsoft';
  externalFormId: string;
  title: string;
  description?: string;
  sections: ProviderFormSectionDefinition[];
  questions: ProviderFormQuestionDefinition[];
}

export interface ProviderAuthCodeExchangeResult {
  tokenSet: ProviderTokenSet;
  idToken: string;
  externalAccountId: string;
}

export interface ProviderConnector {
  readonly provider: 'google' | 'microsoft';
  buildAuthorizationUrl(input: ProviderAuthStartInput): ProviderAuthStartResult;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<ProviderAuthCodeExchangeResult>;
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
  getFormDefinition(input: {
    accessToken: string;
    externalFormId: string;
  }): Promise<ProviderFormDefinition>;
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

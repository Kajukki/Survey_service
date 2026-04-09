import { createHash, randomUUID } from 'node:crypto';
import { GoogleFormsConnector, type ConnectorHttpClient } from '@survey-service/connectors';
import type { ProviderAuthStartResult, ProviderTokenSet } from '@survey-service/contracts';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { Config } from '../../../server/config';
import { AppError, ErrorCode, ForbiddenError } from '../../../server/errors';
import { createGoogleAuthRepository } from './google-auth.repository';
import { createProviderCredentialCrypto } from './credential-crypto';

export interface GoogleAuthPrincipal {
  userId: string;
  orgId: string;
}

export interface LinkedGoogleConnection {
  id: string;
  type: 'google';
  name: string;
  externalId: string;
  ownerId: string;
  syncStatus: 'idle';
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleAuthService {
  startAuthorization(input: {
    principal: GoogleAuthPrincipal;
    input: {
      redirectUri: string;
      codeChallenge: string;
      codeChallengeMethod: 'S256';
      scopes?: string[];
    };
  }): Promise<ProviderAuthStartResult>;
  completeAuthorization(input: {
    principal: GoogleAuthPrincipal;
    input: {
      code: string;
      state: string;
      codeVerifier: string;
      redirectUri: string;
      connectionName?: string;
    };
  }): Promise<LinkedGoogleConnection>;
}

export interface PendingAuthState {
  state: string;
  userId: string;
  orgId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
}

interface StoredGoogleConnection {
  connection: LinkedGoogleConnection;
  tokenSet: ProviderTokenSet;
  idToken: string;
}

interface GoogleAuthCodeExchangeResult {
  tokenSet: ProviderTokenSet;
  externalAccountId: string;
  idToken: string;
}

export interface GoogleAuthStateStore {
  save(state: PendingAuthState): Promise<void>;
  consume(state: string): Promise<PendingAuthState | null>;
}

export interface GoogleConnectionStore {
  upsert(input: {
    ownerId: string;
    orgId: string;
    externalId: string;
    name: string;
    tokenSet: ProviderTokenSet;
    idToken: string;
  }): Promise<LinkedGoogleConnection>;
}

interface GoogleAuthConnector {
  buildAuthorizationUrl(input: {
    provider: 'google';
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    scopes: string[];
  }): ProviderAuthStartResult;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<GoogleAuthCodeExchangeResult>;
}

interface GoogleAuthServiceDeps {
  connector: GoogleAuthConnector;
  stateStore: GoogleAuthStateStore;
  connectionStore: GoogleConnectionStore;
  allowedScopes?: string[];
  now?: () => Date;
}

interface ProviderLikeError {
  provider?: string;
  code?: string;
  message?: string;
  retryable?: boolean;
  status?: number;
}

function isGoogleAuthCodeExchangeResult(value: unknown): value is GoogleAuthCodeExchangeResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const tokenSet = candidate.tokenSet as Record<string, unknown> | undefined;

  return Boolean(
    tokenSet &&
      typeof tokenSet.accessToken === 'string' &&
      typeof candidate.externalAccountId === 'string' &&
      typeof candidate.idToken === 'string',
  );
}

function toCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createInMemoryStateStore(): GoogleAuthStateStore {
  const stateMap = new Map<string, PendingAuthState>();

  return {
    async save(state) {
      stateMap.set(state.state, state);
    },
    async consume(state) {
      const existing = stateMap.get(state) ?? null;
      if (existing) {
        stateMap.delete(state);
      }
      return existing;
    },
  };
}

export function createInMemoryConnectionStore(): GoogleConnectionStore {
  const connectionMap = new Map<string, StoredGoogleConnection>();

  return {
    async upsert(input) {
      const now = new Date();
      const key = `${input.ownerId}:${input.externalId}`;
      const existing = connectionMap.get(key);
      if (existing) {
        const updated: LinkedGoogleConnection = {
          ...existing.connection,
          name: input.name,
          updatedAt: now,
        };

        connectionMap.set(key, {
          connection: updated,
          tokenSet: input.tokenSet,
          idToken: input.idToken,
        });

        return updated;
      }

      const created: LinkedGoogleConnection = {
        id: randomUUID(),
        type: 'google',
        name: input.name,
        externalId: input.externalId,
        ownerId: input.ownerId,
        syncStatus: 'idle',
        createdAt: now,
        updatedAt: now,
      };

      connectionMap.set(key, {
        connection: created,
        tokenSet: input.tokenSet,
        idToken: input.idToken,
      });

      return created;
    },
  };
}

function createFetchHttpClient(timeoutMs: number = 10_000): ConnectorHttpClient {
  return {
    async request<T>(input: {
      method: 'GET' | 'POST';
      url: string;
      headers?: Record<string, string>;
      query?: Record<string, string | undefined>;
      body?: unknown;
    }) {
      const url = new URL(input.url);

      if (input.query) {
        for (const [key, value] of Object.entries(input.query)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: input.method,
          headers: input.headers as HeadersInit,
          body: input.body ? JSON.stringify(input.body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw {
            message: `Google API request failed with status ${response.status}`,
            response: {
              status: response.status,
              data: body,
            },
          };
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createGoogleAuthService(deps: GoogleAuthServiceDeps): GoogleAuthService {
  const now = deps.now ?? (() => new Date());
  const requiredScopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ];
  const allowedScopes = new Set(
    (deps.allowedScopes ?? [
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ]).map((scope) => scope.trim()),
  );
  for (const requiredScope of requiredScopes) {
    allowedScopes.add(requiredScope);
  }

  function isProviderLikeError(error: unknown): error is ProviderLikeError {
    return !!error && typeof error === 'object' && 'code' in error && 'message' in error;
  }

  function resolveRequestedScopes(requestedScopes: string[] | undefined): string[] {
    if (!requestedScopes || requestedScopes.length === 0) {
      return [...allowedScopes];
    }

    const normalizedRequestedScopes = requestedScopes.map((scope) => scope.trim());
    const disallowed = normalizedRequestedScopes.filter((scope) => !allowedScopes.has(scope));
    if (disallowed.length > 0) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        400,
        `Unsupported Google OAuth scopes requested: ${disallowed.join(', ')}`,
      );
    }

    return [...new Set([...normalizedRequestedScopes, ...requiredScopes])];
  }

  return {
    async startAuthorization({ principal, input }) {
      const state = randomUUID();
      const scopes = resolveRequestedScopes(input.scopes);

      await deps.stateStore.save({
        state,
        userId: principal.userId,
        orgId: principal.orgId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        expiresAt: new Date(now().getTime() + 10 * 60 * 1000),
      });

      return deps.connector.buildAuthorizationUrl({
        provider: 'google',
        redirectUri: input.redirectUri,
        state,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        scopes,
      });
    },

    async completeAuthorization({ principal, input }) {
      const state = await deps.stateStore.consume(input.state);
      if (!state) {
        throw new AppError(ErrorCode.BAD_REQUEST, 400, 'Invalid or expired auth state');
      }

      if (state.userId !== principal.userId) {
        throw new ForbiddenError('Auth state does not belong to current user');
      }

      if (state.expiresAt <= now()) {
        throw new AppError(ErrorCode.BAD_REQUEST, 400, 'Auth state expired');
      }

      if (state.redirectUri !== input.redirectUri) {
        throw new AppError(ErrorCode.BAD_REQUEST, 400, 'Redirect URI mismatch');
      }

      if (toCodeChallenge(input.codeVerifier) !== state.codeChallenge) {
        throw new AppError(ErrorCode.BAD_REQUEST, 400, 'Invalid PKCE code verifier');
      }

      let exchangeResult: GoogleAuthCodeExchangeResult;
      try {
        const rawExchangeResult = await deps.connector.exchangeAuthorizationCode({
          code: input.code,
          redirectUri: input.redirectUri,
          codeVerifier: input.codeVerifier,
        });

        if (!isGoogleAuthCodeExchangeResult(rawExchangeResult)) {
          throw new AppError(
            ErrorCode.BAD_REQUEST,
            400,
            'Google OAuth connector returned an invalid token exchange payload',
          );
        }

        exchangeResult = rawExchangeResult;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        if (isProviderLikeError(error)) {
          const statusCode = typeof error.status === 'number' ? error.status : 400;
          const errorCode = statusCode >= 500 ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.BAD_REQUEST;
          throw new AppError(errorCode, statusCode, error.message ?? 'Google OAuth exchange failed', {
            provider: error.provider,
            providerCode: error.code,
            retryable: error.retryable,
          });
        }

        throw error;
      }

      return deps.connectionStore.upsert({
        ownerId: principal.userId,
        orgId: principal.orgId,
        externalId: exchangeResult.externalAccountId,
        name: input.connectionName ?? 'Google Forms Connection',
        tokenSet: exchangeResult.tokenSet,
        idToken: exchangeResult.idToken,
      });
    },
  };
}

export function createDefaultGoogleAuthService(
  config: Config | undefined,
  db?: Kysely<Database>,
): GoogleAuthService {
  if (!config) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      500,
      'Google auth service requires API configuration',
    );
  }

  const connector = new GoogleFormsConnector(
    {
      clientId: config.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
      authBaseUrl: config.GOOGLE_OAUTH_AUTH_BASE_URL,
      tokenUrl: config.GOOGLE_OAUTH_TOKEN_URL,
      formsApiBaseUrl: config.GOOGLE_FORMS_API_BASE_URL,
    },
    createFetchHttpClient(),
  );

  if (db) {
    const credentialCrypto = createProviderCredentialCrypto({
      base64Key: config.CREDENTIAL_ENCRYPTION_KEY_B64,
      keyVersion: config.CREDENTIAL_ENCRYPTION_KEY_VERSION,
    });
    const repository = createGoogleAuthRepository(db, credentialCrypto);
    return createGoogleAuthService({
      connector,
      stateStore: repository.stateStore,
      connectionStore: repository.connectionStore,
      allowedScopes: config.GOOGLE_OAUTH_ALLOWED_SCOPES,
    });
  }

  return createGoogleAuthService({
    connector,
    stateStore: createInMemoryStateStore(),
    connectionStore: createInMemoryConnectionStore(),
    allowedScopes: config.GOOGLE_OAUTH_ALLOWED_SCOPES,
  });
}

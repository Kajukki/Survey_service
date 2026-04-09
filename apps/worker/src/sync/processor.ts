import type { Logger } from 'pino';
import type { Pool } from 'pg';
import type { SyncJobMessage } from '@survey-service/messaging';
import type { WorkerConfig } from '../config.js';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  isTokenExpiringSoon,
} from '../crypto/credentials.js';
import {
  loadProviderConnection,
  persistRefreshedProviderToken,
} from '../db/connections.js';
import {
  refreshFormResponseCount,
  upsertAnalyticsSnapshot,
  upsertForm,
  upsertFormResponse,
} from '../db/forms.js';
import {
  buildPersistedFormSchema,
  buildQuestionLookup,
  type QuestionLookup,
} from '../analytics/schema.js';
import { buildAnalyticsSnapshot, type SyncedResponse } from '../analytics/snapshot.js';
import { listAllProviderForms } from '../sync-utils.js';
import { createGoogleFormsConnector } from './providers/google.js';

export interface SyncJobProcessingContext {
  stage:
    | 'load-connection'
    | 'validate-provider'
    | 'decrypt-credentials'
    | 'refresh-token'
    | 'persist-refreshed-token'
    | 'list-forms'
    | 'fetch-form-definition'
    | 'persist-forms'
    | 'list-responses'
    | 'persist-responses'
    | 'persist-analytics';
  effectiveConnectionId?: string;
  provider?: 'google' | 'microsoft';
}

export class SyncJobProcessingError extends Error {
  constructor(
    message: string,
    readonly context: SyncJobProcessingContext,
    readonly causeError: unknown,
  ) {
    super(message);
    this.name = 'SyncJobProcessingError';
  }
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message;
    }
  }

  return 'unknown worker error';
}

function toPreviewString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toPreviewString(item))
      .filter((item) => item.length > 0)
      .join(', ');
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const choiceAnswers = candidate.choiceAnswers as { answers?: unknown[] } | undefined;
    if (choiceAnswers?.answers && Array.isArray(choiceAnswers.answers)) {
      return choiceAnswers.answers.map((item) => toPreviewString(item)).join(', ');
    }

    const textAnswers = candidate.textAnswers as
      | { answers?: Array<{ value?: string }> }
      | undefined;
    if (textAnswers?.answers && Array.isArray(textAnswers.answers)) {
      return textAnswers.answers
        .map((item) => (typeof item?.value === 'string' ? item.value : ''))
        .filter((item) => item.length > 0)
        .join(' | ');
    }

    try {
      return JSON.stringify(candidate);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}

function buildAnswerPreview(answers: Record<string, unknown>, questionLookup: QuestionLookup) {
  return Object.entries(answers)
    .map(([questionId, rawValue]) => {
      const question = questionLookup.get(questionId);
      const preview = toPreviewString(rawValue).trim();
      return {
        questionId,
        questionLabel: question?.label ?? questionId,
        questionType: question?.type ?? 'text',
        valuePreview: preview.length > 0 ? preview.slice(0, 160) : '(no answer)',
      };
    })
    .slice(0, 8);
}

function resolveCompletion(answers: Record<string, unknown>): 'completed' | 'partial' {
  return Object.keys(answers).length > 0 ? 'completed' : 'partial';
}

export async function processSyncJob(
  payload: SyncJobMessage,
  pool: Pool,
  config: WorkerConfig,
  logger: Logger,
): Promise<void> {
  let stage: SyncJobProcessingContext['stage'] = 'load-connection';
  let effectiveConnectionId: string | undefined;
  let provider: SyncJobProcessingContext['provider'];

  try {
    const connection = await loadProviderConnection(pool, payload.connectionId, payload.requestedBy);
    if (!connection) {
      throw new Error('Provider connection not found for sync job and requester');
    }

    effectiveConnectionId = connection.id;
    provider = connection.provider;

    stage = 'validate-provider';
    if (connection.provider !== 'google') {
      throw new Error(`Provider ${connection.provider} is not supported by this worker slice`);
    }

    const connector = createGoogleFormsConnector(config);

    stage = 'decrypt-credentials';
    const decrypted = decryptCredentialPayload(config, connection);
    let tokenSet = decrypted.tokenSet;

    if (isTokenExpiringSoon(tokenSet.expiresAt)) {
      if (!tokenSet.refreshToken) {
        throw new Error('Google access token is expired and no refresh token is available');
      }

      stage = 'refresh-token';
      const refreshedTokenSet = await connector.refreshAccessToken({
        refreshToken: tokenSet.refreshToken,
      });

      tokenSet = {
        accessToken: refreshedTokenSet.accessToken,
        refreshToken: refreshedTokenSet.refreshToken,
        expiresAt: refreshedTokenSet.expiresAt,
        scope: refreshedTokenSet.scope,
        tokenType: refreshedTokenSet.tokenType,
      };

      const encrypted = encryptCredentialPayload(config, {
        tokenSet,
        idToken: decrypted.idToken,
      });

      stage = 'persist-refreshed-token';
      await persistRefreshedProviderToken(pool, {
        connectionId: connection.id,
        encryptedTokenPayload: encrypted.encryptedTokenPayload,
        encryptedTokenIv: encrypted.encryptedTokenIv,
        encryptedTokenTag: encrypted.encryptedTokenTag,
        encryptedTokenKeyVersion: encrypted.encryptedTokenKeyVersion,
        expiresAt: tokenSet.expiresAt,
        scope: tokenSet.scope ?? null,
        tokenType: tokenSet.tokenType ?? 'Bearer',
      });
    }

    stage = 'list-forms';
    const formsResult = await listAllProviderForms(connector, tokenSet.accessToken);

    stage = 'persist-forms';
    for (const form of formsResult.items) {
      stage = 'fetch-form-definition';
      const formDefinition = await connector.getFormDefinition({
        accessToken: tokenSet.accessToken,
        externalFormId: form.externalFormId,
      });
      const persistedSchema = buildPersistedFormSchema(formDefinition);
      const questionLookup = buildQuestionLookup(persistedSchema);

      stage = 'persist-forms';
      const persistedFormId = await upsertForm(pool, {
        ownerId: connection.owner_id,
        connectionId: connection.id,
        externalFormId: form.externalFormId,
        title: formDefinition.title,
        description: formDefinition.description ?? null,
        persistedSchema,
        responseCount: form.responseCount,
      });
      if (!persistedFormId) {
        continue;
      }

      const syncedResponses: SyncedResponse[] = [];

      stage = 'list-responses';
      let nextPageToken: string | undefined;
      let pageCount = 0;

      do {
        const responsePage = await connector.listFormResponses({
          accessToken: tokenSet.accessToken,
          externalFormId: form.externalFormId,
          pageToken: nextPageToken,
        });

        stage = 'persist-responses';
        for (const response of responsePage.responses) {
          const answers = response.answers ?? {};
          const answerPreview = buildAnswerPreview(answers, questionLookup);
          syncedResponses.push({
            submittedAt: response.submittedAt,
            completion: resolveCompletion(answers),
            answers,
          });

          await upsertFormResponse(pool, {
            ownerId: connection.owner_id,
            formId: persistedFormId,
            externalResponseId: response.externalResponseId,
            submittedAt: response.submittedAt ?? null,
            completion: resolveCompletion(answers),
            answers,
            answerPreview,
          });
        }

        nextPageToken = responsePage.nextPageToken;
        pageCount += 1;
      } while (nextPageToken && pageCount < 50);

      await refreshFormResponseCount(pool, persistedFormId);

      stage = 'persist-analytics';
      const analyticsSnapshot = buildAnalyticsSnapshot(persistedSchema, syncedResponses);
      await upsertAnalyticsSnapshot(pool, connection.owner_id, persistedFormId, analyticsSnapshot);
    }

    logger.info(
      {
        jobId: payload.jobId,
        connectionId: payload.connectionId,
        effectiveConnectionId,
        fetchedForms: formsResult.items.length,
        hasMoreFormPages: formsResult.hasMorePages,
        forcedFullSync: payload.forceFullSync,
      },
      'Processed Google sync job using provider API',
    );
  } catch (error) {
    const message = extractErrorMessage(error);
    throw new SyncJobProcessingError(
      message,
      {
        stage,
        effectiveConnectionId,
        provider,
      },
      error,
    );
  }
}

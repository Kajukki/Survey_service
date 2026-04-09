import { Pool } from 'pg';
import type { PersistedFormSchema } from '../analytics/schema.js';
import type { PersistedAnalyticsSnapshot } from '../analytics/snapshot.js';

export interface UpsertFormInput {
  ownerId: string;
  connectionId: string;
  externalFormId: string;
  title: string;
  description: string | null;
  persistedSchema: PersistedFormSchema;
  responseCount: number;
}

export interface UpsertResponseInput {
  ownerId: string;
  formId: string;
  externalResponseId: string;
  submittedAt: string | null;
  completion: 'completed' | 'partial';
  answers: Record<string, unknown>;
  answerPreview: Array<{
    questionId: string;
    questionLabel: string;
    questionType: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
    valuePreview: string;
  }>;
}

export async function upsertForm(pool: Pool, input: UpsertFormInput): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO forms (
        owner_id,
        connection_id,
        external_form_id,
        title,
        description,
        form_schema_json,
        response_count,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
      ON CONFLICT (owner_id, connection_id, external_form_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        form_schema_json = EXCLUDED.form_schema_json,
        response_count = EXCLUDED.response_count,
        updated_at = NOW()
      RETURNING id
    `,
    [
      input.ownerId,
      input.connectionId,
      input.externalFormId,
      input.title,
      input.description,
      JSON.stringify(input.persistedSchema),
      input.responseCount,
    ],
  );

  return result.rows[0]?.id ?? null;
}

export async function upsertFormResponse(pool: Pool, input: UpsertResponseInput): Promise<void> {
  await pool.query(
    `
      INSERT INTO form_responses (
        owner_id,
        form_id,
        external_response_id,
        submitted_at,
        completion,
        answers_json,
        answer_preview_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW())
      ON CONFLICT (form_id, external_response_id)
      DO UPDATE SET
        submitted_at = EXCLUDED.submitted_at,
        completion = EXCLUDED.completion,
        answers_json = EXCLUDED.answers_json,
        answer_preview_json = EXCLUDED.answer_preview_json,
        updated_at = NOW()
    `,
    [
      input.ownerId,
      input.formId,
      input.externalResponseId,
      input.submittedAt,
      input.completion,
      JSON.stringify(input.answers),
      JSON.stringify(input.answerPreview),
    ],
  );
}

export async function refreshFormResponseCount(pool: Pool, formId: string): Promise<void> {
  await pool.query(
    `
      UPDATE forms
      SET
        response_count = (
          SELECT COUNT(*)::int
          FROM form_responses
          WHERE form_id = $1
        ),
        updated_at = NOW()
      WHERE id = $1
    `,
    [formId],
  );
}

export async function upsertAnalyticsSnapshot(
  pool: Pool,
  ownerId: string,
  formId: string,
  analyticsSnapshot: PersistedAnalyticsSnapshot,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO form_analytics_snapshots (
        owner_id,
        form_id,
        total_responses,
        generated_at,
        analytics_json,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), $4::jsonb, NOW())
      ON CONFLICT (form_id)
      DO UPDATE SET
        total_responses = EXCLUDED.total_responses,
        generated_at = NOW(),
        analytics_json = EXCLUDED.analytics_json,
        updated_at = NOW()
    `,
    [ownerId, formId, analyticsSnapshot.totalResponses, JSON.stringify(analyticsSnapshot)],
  );
}

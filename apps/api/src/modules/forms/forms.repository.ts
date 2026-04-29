import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export type FormRow = {
  id: string;
  owner_id: string;
  connection_id: string;
  external_form_id: string;
  title: string;
  description: string | null;
  response_count: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type FormResponseRow = {
  external_response_id: string;
  submitted_at: Date | string | null;
  completion: 'completed' | 'partial';
  answer_preview_json: unknown;
  answers_json: unknown;
};

export interface FormsRepository {
  listOwnedForms(userId: string): Promise<FormRow[]>;
  listSharedForms(userId: string): Promise<FormRow[]>;
  findOwnedFormById(formId: string, userId: string): Promise<FormRow | null>;
  findSharedFormById(formId: string, userId: string): Promise<FormRow | null>;
  getFormSchema(formId: string): Promise<unknown | null>;
  listFormResponses(formId: string): Promise<FormResponseRow[]>;
}

export function createFormsRepository(db: Kysely<Database>): FormsRepository {
  return {
    async listOwnedForms(userId: string): Promise<FormRow[]> {
      return db
        .selectFrom('forms')
        .select([
          'id',
          'owner_id',
          'connection_id',
          'external_form_id',
          'title',
          'description',
          'response_count',
          'created_at',
          'updated_at',
        ])
        .where('owner_id', '=', userId)
        .execute();
    },

    async listSharedForms(userId: string): Promise<FormRow[]> {
      return db
        .selectFrom('forms')
        .innerJoin('form_shares', 'form_shares.form_id', 'forms.id')
        .select([
          'forms.id as id',
          'forms.owner_id as owner_id',
          'forms.connection_id as connection_id',
          'forms.external_form_id as external_form_id',
          'forms.title as title',
          'forms.description as description',
          'forms.response_count as response_count',
          'forms.created_at as created_at',
          'forms.updated_at as updated_at',
        ])
        .where('form_shares.grantee_user_id', '=', userId)
        .execute();
    },

    async findOwnedFormById(formId: string, userId: string): Promise<FormRow | null> {
      const ownedForm = await db
        .selectFrom('forms')
        .select([
          'id',
          'owner_id',
          'connection_id',
          'external_form_id',
          'title',
          'description',
          'response_count',
          'created_at',
          'updated_at',
        ])
        .where('id', '=', formId)
        .where('owner_id', '=', userId)
        .executeTakeFirst();

      return ownedForm ?? null;
    },

    async findSharedFormById(formId: string, userId: string): Promise<FormRow | null> {
      const sharedForm = await db
        .selectFrom('forms')
        .innerJoin('form_shares', 'form_shares.form_id', 'forms.id')
        .select([
          'forms.id as id',
          'forms.owner_id as owner_id',
          'forms.connection_id as connection_id',
          'forms.external_form_id as external_form_id',
          'forms.title as title',
          'forms.description as description',
          'forms.response_count as response_count',
          'forms.created_at as created_at',
          'forms.updated_at as updated_at',
        ])
        .where('forms.id', '=', formId)
        .where('form_shares.grantee_user_id', '=', userId)
        .executeTakeFirst();

      return sharedForm ?? null;
    },

    async getFormSchema(formId: string): Promise<unknown | null> {
      const row = await db
        .selectFrom('forms')
        .select(['form_schema_json'])
        .where('id', '=', formId)
        .executeTakeFirst();

      return row?.form_schema_json ?? null;
    },

    async listFormResponses(formId: string): Promise<FormResponseRow[]> {
      return db
        .selectFrom('form_responses')
        .select([
          'external_response_id',
          'submitted_at',
          'completion',
          'answer_preview_json',
          'answers_json',
        ])
        .where('form_id', '=', formId)
        .orderBy('submitted_at', 'desc')
        .execute();
    },
  };
}

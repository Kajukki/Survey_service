import type { ColumnType } from 'kysely';

export type JobType = 'sync' | 'export' | 'analysis';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobTrigger = 'manual' | 'scheduled';

type OptionalTimestampColumn = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface JobsTable {
  id: string;
  type: JobType;
  status: JobStatus;
  requested_by: string;
  connection_id: string | null;
  form_id: string | null;
  trigger: JobTrigger;
  started_at: OptionalTimestampColumn;
  completed_at: OptionalTimestampColumn;
  error: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface UsersTable {
  id: ColumnType<string, string | undefined, string>;
  username: string;
  password_hash: string;
  org_id: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AuthRefreshTokensTable {
  id: ColumnType<string, string | undefined, string>;
  user_id: string;
  token_hash: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  revoked_at: OptionalTimestampColumn;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ProviderAuthStatesTable {
  state: string;
  owner_id: string;
  org_id: string;
  redirect_uri: string;
  code_challenge: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ProviderConnectionsTable {
  id: ColumnType<string, string | undefined, string>;
  owner_id: string;
  org_id: string;
  provider: 'google' | 'microsoft';
  external_account_id: string;
  name: string;
  encrypted_token_payload: string | null;
  encrypted_token_iv: string | null;
  encrypted_token_tag: string | null;
  encrypted_token_key_version: string | null;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  scope: string | null;
  token_type: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FormsTable {
  id: ColumnType<string, string | undefined, string>;
  owner_id: string;
  connection_id: string;
  external_form_id: string;
  title: string;
  description: string | null;
  response_count: number;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FormSharesTable {
  id: ColumnType<string, string | undefined, string>;
  form_id: string;
  grantee_user_id: string;
  permission_level: 'read' | 'write' | 'admin';
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ExportJobsTable {
  id: ColumnType<string, string | undefined, string>;
  requested_by: string;
  form_id: string;
  format: 'csv' | 'json' | 'excel';
  status: 'queued' | 'ready' | 'failed';
  download_url: string | null;
  error: string | null;
  requested_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
}

export interface FormResponsesTable {
  id: ColumnType<string, string | undefined, string>;
  owner_id: string;
  form_id: string;
  external_response_id: string;
  submitted_at: OptionalTimestampColumn;
  completion: 'completed' | 'partial';
  answers_json: ColumnType<unknown, unknown, unknown>;
  answer_preview_json: ColumnType<unknown, unknown, unknown>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface DatabaseSchema {
  jobs: JobsTable;
  users: UsersTable;
  auth_refresh_tokens: AuthRefreshTokensTable;
  provider_auth_states: ProviderAuthStatesTable;
  provider_connections: ProviderConnectionsTable;
  forms: FormsTable;
  form_shares: FormSharesTable;
  form_responses: FormResponsesTable;
  export_jobs: ExportJobsTable;
}

export type Database = DatabaseSchema;

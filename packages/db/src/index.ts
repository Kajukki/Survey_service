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
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  scope: string | null;
  token_type: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface DatabaseSchema {
  jobs: JobsTable;
  users: UsersTable;
  auth_refresh_tokens: AuthRefreshTokensTable;
  provider_auth_states: ProviderAuthStatesTable;
  provider_connections: ProviderConnectionsTable;
}

export type Database = DatabaseSchema;

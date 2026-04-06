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

export interface DatabaseSchema {
  jobs: JobsTable;
}

export type Database = DatabaseSchema;

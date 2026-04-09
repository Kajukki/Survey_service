import type { Kysely } from 'kysely';
import type { SyncJobMessage } from '@survey-service/messaging';
import type { Database } from '@survey-service/db';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobTrigger = 'manual' | 'scheduled';

export interface SyncJobRecord {
  id: string;
  type: 'sync';
  status: JobStatus;
  requestedBy: string;
  connectionId: string | null;
  formId: string | null;
  trigger: JobTrigger;
  source: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface CreateSyncJobInput {
  id: string;
  requestedBy: string;
  connectionId: string | null;
  formId: string | null;
  trigger: JobTrigger;
  outboxMessage: SyncJobMessage;
}

export interface JobsRepository {
  createSyncJob(input: CreateSyncJobInput): Promise<SyncJobRecord>;
  listJobs(
    requestedBy: string,
    page: number,
    perPage: number,
  ): Promise<{ items: SyncJobRecord[]; total: number }>;
  getJobById(requestedBy: string, id: string): Promise<SyncJobRecord | null>;
}

function toIso(dateValue: Date | string | null): string | null {
  if (!dateValue) {
    return null;
  }

  return dateValue instanceof Date ? dateValue.toISOString() : new Date(dateValue).toISOString();
}

function mapJobRow(row: {
  id: string;
  type: 'sync';
  status: JobStatus;
  requested_by: string;
  connection_id: string | null;
  form_id: string | null;
  trigger: JobTrigger;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  error: string | null;
}): SyncJobRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requestedBy: row.requested_by,
    connectionId: row.connection_id,
    formId: row.form_id,
    trigger: row.trigger,
    source: row.trigger === 'manual' ? 'manual_sync' : 'scheduled_sync',
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    error: row.error,
  };
}

export function createJobsRepository(db: Kysely<Database>): JobsRepository {
  return {
    async createSyncJob(input: CreateSyncJobInput): Promise<SyncJobRecord> {
      const inserted = await db.transaction().execute(async (trx) => {
        const createdJob = await trx
          .insertInto('jobs')
          .values({
            id: input.id,
            type: 'sync',
            status: 'queued',
            requested_by: input.requestedBy,
            connection_id: input.connectionId,
            form_id: input.formId,
            trigger: input.trigger,
            error: null,
            started_at: null,
            completed_at: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('outbox_events')
          .values({
            event_type: 'sync_job.queued',
            payload_json: input.outboxMessage,
            status: 'pending',
            attempt_count: 0,
            available_at: new Date(),
            locked_at: null,
            published_at: null,
            last_error: null,
          })
          .executeTakeFirstOrThrow();

        return createdJob;
      });

      return mapJobRow(inserted as any);
    },

    async listJobs(
      requestedBy: string,
      page: number,
      perPage: number,
    ): Promise<{ items: SyncJobRecord[]; total: number }> {
      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
      const safePerPage =
        Number.isFinite(perPage) && perPage > 0 ? Math.min(Math.floor(perPage), 100) : 20;

      const [rows, countResult] = await Promise.all([
        db
          .selectFrom('jobs')
          .selectAll()
          .where('requested_by', '=', requestedBy)
          .orderBy('created_at', 'desc')
          .limit(safePerPage)
          .offset((safePage - 1) * safePerPage)
          .execute(),
        db
          .selectFrom('jobs')
          .select(db.fn.count('id').as('count'))
          .where('requested_by', '=', requestedBy)
          .executeTakeFirst(),
      ]);

      return {
        items: rows.map((row) => mapJobRow(row as any)),
        total: Number(countResult?.count ?? 0),
      };
    },

    async getJobById(requestedBy: string, id: string): Promise<SyncJobRecord | null> {
      const row = await db
        .selectFrom('jobs')
        .selectAll()
        .where('requested_by', '=', requestedBy)
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        return null;
      }

      return mapJobRow(row as any);
    },
  };
}

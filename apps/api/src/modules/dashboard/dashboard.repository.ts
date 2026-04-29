import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export type DashboardFormRow = {
  id: string;
  connection_id: string;
  title: string;
  response_count: number;
  updated_at: Date | string;
};

export type SyncJobRow = {
  id: string;
  status: string;
  trigger: string;
  created_at: Date | string;
};

export type LatestSyncJobRow = {
  id: string;
  created_at: Date | string;
  completed_at: Date | string | null;
};

export type FormShareRow = {
  permission_level: 'read' | 'write' | 'admin';
};

export type FormResponseRow = {
  id: string;
  submitted_at: Date | string | null;
  completion: 'completed' | 'partial';
};

export interface DashboardRepository {
  findOwnedForm(formId: string, ownerId: string): Promise<DashboardFormRow | null>;
  hasSharedAccess(formId: string, userId: string): Promise<boolean>;
  findFormById(formId: string): Promise<DashboardFormRow | null>;
  listSyncJobsInRange(
    formId: string,
    connectionId: string,
    rangeStart: Date,
    rangeEndExclusive: Date,
  ): Promise<SyncJobRow[]>;
  getLatestSucceededSyncJob(
    formId: string,
    connectionId: string,
  ): Promise<LatestSyncJobRow | null>;
  listFormShares(formId: string): Promise<FormShareRow[]>;
  listResponsesInRange(
    formId: string,
    rangeStart: Date,
    rangeEndExclusive: Date,
  ): Promise<FormResponseRow[]>;
}

export function createDashboardRepository(db: Kysely<Database>): DashboardRepository {
  return {
    async findOwnedForm(formId: string, ownerId: string): Promise<DashboardFormRow | null> {
      const form = await db
        .selectFrom('forms')
        .select(['id', 'connection_id', 'title', 'response_count', 'updated_at'])
        .where('id', '=', formId)
        .where('owner_id', '=', ownerId)
        .executeTakeFirst();

      return form ?? null;
    },

    async hasSharedAccess(formId: string, userId: string): Promise<boolean> {
      const share = await db
        .selectFrom('form_shares')
        .select('form_id')
        .where('form_id', '=', formId)
        .where('grantee_user_id', '=', userId)
        .executeTakeFirst();

      return Boolean(share);
    },

    async findFormById(formId: string): Promise<DashboardFormRow | null> {
      const form = await db
        .selectFrom('forms')
        .select(['id', 'connection_id', 'title', 'response_count', 'updated_at'])
        .where('id', '=', formId)
        .executeTakeFirst();

      return form ?? null;
    },

    async listSyncJobsInRange(
      formId: string,
      connectionId: string,
      rangeStart: Date,
      rangeEndExclusive: Date,
    ): Promise<SyncJobRow[]> {
      return db
        .selectFrom('jobs')
        .select(['id', 'status', 'trigger', 'created_at'])
        .where((eb) =>
          eb.or([
            eb('form_id', '=', formId),
            eb.and([eb('form_id', 'is', null), eb('connection_id', '=', connectionId)]),
          ]),
        )
        .where('created_at', '>=', rangeStart)
        .where('created_at', '<', rangeEndExclusive)
        .execute();
    },

    async getLatestSucceededSyncJob(
      formId: string,
      connectionId: string,
    ): Promise<LatestSyncJobRow | null> {
      const latest = await db
        .selectFrom('jobs')
        .select(['id', 'created_at', 'completed_at'])
        .where((eb) =>
          eb.or([
            eb('form_id', '=', formId),
            eb.and([eb('form_id', 'is', null), eb('connection_id', '=', connectionId)]),
          ]),
        )
        .where('status', '=', 'succeeded')
        .orderBy('completed_at', 'desc')
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      return latest ?? null;
    },

    async listFormShares(formId: string): Promise<FormShareRow[]> {
      return db
        .selectFrom('form_shares')
        .select(['permission_level'])
        .where('form_id', '=', formId)
        .execute();
    },

    async listResponsesInRange(
      formId: string,
      rangeStart: Date,
      rangeEndExclusive: Date,
    ): Promise<FormResponseRow[]> {
      return db
        .selectFrom('form_responses')
        .select(['id', 'submitted_at', 'completion'])
        .where('form_id', '=', formId)
        .where('submitted_at', '>=', rangeStart)
        .where('submitted_at', '<', rangeEndExclusive)
        .execute();
    },
  };
}

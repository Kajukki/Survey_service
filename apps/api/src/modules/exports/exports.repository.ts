import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';

export type ExportJobRow = {
  id: string;
  format: 'csv' | 'json' | 'excel';
  status: 'queued' | 'ready' | 'failed';
  requested_at: Date | string;
  download_url: string | null;
  error: string | null;
  completed_at: Date | string | null;
};

export interface ExportsRepository {
  listExportsForOwner(ownerId: string): Promise<Array<Pick<ExportJobRow, 'id' | 'format' | 'status' | 'requested_at'>>>;
  getExportDetail(ownerId: string, exportId: string): Promise<ExportJobRow | null>;
  getExportDownload(ownerId: string, exportId: string): Promise<Pick<ExportJobRow, 'id' | 'status' | 'download_url'> | null>;
  isFormOwnedByUser(formId: string, ownerId: string): Promise<boolean>;
  createExportJob(input: {
    requestedBy: string;
    formId: string;
    format: 'csv' | 'json' | 'excel';
  }): Promise<Pick<ExportJobRow, 'id' | 'format' | 'status' | 'requested_at'>>;
}

export function createExportsRepository(db: Kysely<Database>): ExportsRepository {
  return {
    async listExportsForOwner(ownerId: string) {
      return db
        .selectFrom('export_jobs')
        .select(['id', 'format', 'status', 'requested_at'])
        .where('requested_by', '=', ownerId)
        .orderBy('requested_at', 'desc')
        .execute();
    },

    async getExportDetail(ownerId: string, exportId: string): Promise<ExportJobRow | null> {
      const exportJob = await db
        .selectFrom('export_jobs')
        .select(['id', 'format', 'status', 'requested_at', 'download_url', 'error', 'completed_at'])
        .where('id', '=', exportId)
        .where('requested_by', '=', ownerId)
        .executeTakeFirst();

      return exportJob ?? null;
    },

    async getExportDownload(ownerId: string, exportId: string) {
      const exportJob = await db
        .selectFrom('export_jobs')
        .select(['id', 'status', 'download_url'])
        .where('id', '=', exportId)
        .where('requested_by', '=', ownerId)
        .executeTakeFirst();

      return exportJob ?? null;
    },

    async isFormOwnedByUser(formId: string, ownerId: string): Promise<boolean> {
      const ownedForm = await db
        .selectFrom('forms')
        .select('id')
        .where('id', '=', formId)
        .where('owner_id', '=', ownerId)
        .executeTakeFirst();

      return Boolean(ownedForm);
    },

    async createExportJob(input: {
      requestedBy: string;
      formId: string;
      format: 'csv' | 'json' | 'excel';
    }) {
      return db
        .insertInto('export_jobs')
        .values({
          requested_by: input.requestedBy,
          form_id: input.formId,
          format: input.format,
          status: 'queued',
          download_url: null,
          error: null,
          completed_at: null,
        })
        .returning(['id', 'format', 'status', 'requested_at'])
        .executeTakeFirstOrThrow();
    },
  };
}

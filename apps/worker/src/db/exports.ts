import { Pool, PoolClient } from 'pg';

export type ExportJobRow = {
  id: string;
  format: 'csv' | 'json' | 'excel';
};

export async function beginExportTransaction(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query('BEGIN');
  return client;
}

export async function commitExportTransaction(client: PoolClient): Promise<void> {
  await client.query('COMMIT');
}

export async function rollbackExportTransaction(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK');
}

export async function loadQueuedExportJobs(client: PoolClient): Promise<ExportJobRow[]> {
  const queued = await client.query<ExportJobRow>(
    `
      SELECT id, format
      FROM export_jobs
      WHERE status = 'queued'
      ORDER BY requested_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    `,
  );

  return queued.rows;
}

export async function markExportJobReady(
  client: PoolClient,
  jobId: string,
  downloadUrl: string,
): Promise<void> {
  await client.query(
    `
      UPDATE export_jobs
      SET
        status = 'ready',
        download_url = $2,
        error = NULL,
        completed_at = NOW()
      WHERE id = $1
    `,
    [jobId, downloadUrl],
  );
}

export async function markExportJobFailed(
  client: PoolClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  await client.query(
    `
      UPDATE export_jobs
      SET
        status = 'failed',
        error = $2,
        completed_at = NOW()
      WHERE id = $1
    `,
    [jobId, errorMessage],
  );
}

import type { ExportJobRow } from './exports.repository';

export type ExportSummary = {
  id: string;
  format: 'csv' | 'json' | 'excel';
  status: 'queued' | 'ready' | 'failed';
  requested_at: string;
};

export type ExportDetail = ExportSummary & {
  download_url: string | null;
  error: string | null;
  completed_at: string | null;
};

export function mapExportSummary(row: {
  id: string;
  format: 'csv' | 'json' | 'excel';
  status: 'queued' | 'ready' | 'failed';
  requested_at: Date | string;
}): ExportSummary {
  return {
    id: row.id,
    format: row.format,
    status: row.status,
    requested_at: new Date(row.requested_at).toISOString(),
  };
}

export function mapExportDetail(row: ExportJobRow): ExportDetail {
  return {
    id: row.id,
    format: row.format,
    status: row.status,
    requested_at: new Date(row.requested_at).toISOString(),
    download_url: row.download_url,
    error: row.error,
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

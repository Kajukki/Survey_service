CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sync', 'export', 'analysis')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by TEXT NOT NULL,
  connection_id UUID NULL,
  form_id UUID NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_requested_by_created_at
  ON jobs (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at
  ON jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON jobs (created_at DESC);
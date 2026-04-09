CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'excel')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'ready', 'failed')),
  download_url TEXT NULL,
  error TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_requested_by_requested_at
  ON export_jobs (requested_by, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_form_id
  ON export_jobs (form_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  external_form_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  response_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, connection_id, external_form_id)
);

CREATE INDEX IF NOT EXISTS idx_forms_owner_id_updated_at
  ON forms (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forms_connection_id
  ON forms (connection_id, updated_at DESC);

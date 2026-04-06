ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS id_token TEXT NULL;

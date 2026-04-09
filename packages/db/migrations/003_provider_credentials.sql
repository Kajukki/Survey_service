CREATE TABLE IF NOT EXISTS provider_auth_states (
  state TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_auth_states_owner_id
  ON provider_auth_states (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_auth_states_expires_at
  ON provider_auth_states (expires_at);

CREATE TABLE IF NOT EXISTS provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  external_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  encrypted_token_payload TEXT NOT NULL,
  encrypted_token_iv TEXT NOT NULL,
  encrypted_token_tag TEXT NOT NULL,
  encrypted_token_key_version TEXT NOT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, owner_id, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_owner_id
  ON provider_connections (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_connections_provider
  ON provider_connections (provider, owner_id);

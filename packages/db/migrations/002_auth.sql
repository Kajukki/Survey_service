CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'default-org',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id
  ON auth_refresh_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires_at
  ON auth_refresh_tokens (expires_at);

INSERT INTO users (id, username, password_hash, org_id)
VALUES (
  'de2ddde8-ffdd-4eb9-8930-c71f6653f77f',
  'userOne',
  'scrypt$5e6f2764ca9ee88d4d7517b062eb97c9$0df098bbc2919af6435044c9a85a3b143d1abf004cd3c5cc68b89380cd6612c9b4c8b1fff8db03a8838a48ffc41fc74f8fc77268573c2cced881d86fcc5a5757',
  'default-org'
)
ON CONFLICT (username) DO NOTHING;

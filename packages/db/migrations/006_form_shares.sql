CREATE TABLE IF NOT EXISTS form_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  grantee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('read', 'write', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, grantee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_form_shares_form_id
  ON form_shares (form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_shares_grantee_user_id
  ON form_shares (grantee_user_id, created_at DESC);

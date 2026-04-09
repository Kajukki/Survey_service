CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  external_response_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NULL,
  completion TEXT NOT NULL CHECK (completion IN ('completed', 'partial')),
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer_preview_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, external_response_id)
);

CREATE INDEX IF NOT EXISTS idx_form_responses_form_id_submitted_at
  ON form_responses (form_id, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_form_responses_owner_id_created_at
  ON form_responses (owner_id, created_at DESC);

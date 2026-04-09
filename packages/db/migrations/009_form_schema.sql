ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS form_schema_json JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_forms_form_schema_json
  ON forms
  USING GIN (form_schema_json);

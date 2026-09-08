-- Report deadlines apply to every internship route, not only research.
ALTER TABLE report_deadlines
  ALTER COLUMN research_application_id DROP NOT NULL;

ALTER TABLE report_deadlines
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS related_entity_id UUID;

UPDATE report_deadlines
SET related_entity_type = 'research_application', related_entity_id = research_application_id
WHERE related_entity_type IS NULL AND research_application_id IS NOT NULL;

ALTER TABLE report_deadlines
  ADD CONSTRAINT report_deadlines_related_entity_type_check
  CHECK (related_entity_type IN ('research_application', 'opportunity_application', 'self_internship')) NOT VALID;

CREATE INDEX IF NOT EXISTS report_deadlines_related_entity_idx
  ON report_deadlines (student_id, related_entity_type, related_entity_id);

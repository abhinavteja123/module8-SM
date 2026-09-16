-- CRCS can set one cycle-wide default deadline per report type (student_id
-- IS NULL row). A faculty mentor's existing per-student row still takes
-- precedence over the default for that student's internship.
ALTER TABLE report_deadlines
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE report_deadlines
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES internship_cycles(id);

ALTER TABLE report_deadlines
  ADD CONSTRAINT report_deadlines_shape_check CHECK (
    (student_id IS NOT NULL AND related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL)
    OR
    (student_id IS NULL AND cycle_id IS NOT NULL AND report_template_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS report_deadlines_universal_unique
  ON report_deadlines (cycle_id, report_template_id)
  WHERE student_id IS NULL;

-- Generalizes weekly attendance beyond research (mentor_assignment_id-only) so CRCS-opportunity
-- and self-internship mentors can also mark and read attendance, matching the
-- (student_id, related_entity_type, related_entity_id) pattern already used by documents/report_deadlines.
ALTER TABLE weekly_attendance ALTER COLUMN mentor_assignment_id DROP NOT NULL;
ALTER TABLE weekly_attendance ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id);
ALTER TABLE weekly_attendance ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES faculty(id);
ALTER TABLE weekly_attendance ADD COLUMN IF NOT EXISTS related_entity_type TEXT CHECK (related_entity_type IN ('research_application', 'opportunity_application', 'self_internship'));
ALTER TABLE weekly_attendance ADD COLUMN IF NOT EXISTS related_entity_id UUID;

UPDATE weekly_attendance wa
SET student_id = ma.student_id, faculty_id = ma.faculty_id,
    related_entity_type = 'research_application', related_entity_id = ma.research_application_id
FROM mentor_assignments ma
WHERE wa.mentor_assignment_id = ma.id AND wa.student_id IS NULL;

-- A plain unique constraint (not a partial index) is required so PostgREST's
-- upsert(..., { onConflict: '...' }) — which emits ON CONFLICT with no WHERE clause —
-- can actually match it. NULLs never conflict with each other in Postgres, so the
-- WHERE student_id IS NOT NULL guard a partial index would need is unnecessary here.
ALTER TABLE weekly_attendance DROP CONSTRAINT IF EXISTS weekly_attendance_entity_week_unique;
ALTER TABLE weekly_attendance ADD CONSTRAINT weekly_attendance_entity_week_unique
  UNIQUE (student_id, related_entity_type, related_entity_id, week_number);

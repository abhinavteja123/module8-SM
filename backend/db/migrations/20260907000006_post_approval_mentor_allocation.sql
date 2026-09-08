-- CRCS opportunities need a faculty mentor after the student receives final approval.
ALTER TABLE opportunity_applications
  ADD COLUMN IF NOT EXISTS assigned_mentor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mentor_assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS opportunity_applications_assigned_mentor_idx
  ON opportunity_applications (assigned_mentor_id)
  WHERE assigned_mentor_id IS NOT NULL;

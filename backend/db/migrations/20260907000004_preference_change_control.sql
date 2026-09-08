ALTER TABLE internship_cycles
  ADD COLUMN IF NOT EXISTS preference_changes_locked BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS student_preference_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  current_track track_enum NOT NULL,
  requested_track track_enum NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_preference_change_requests_pending_idx
  ON student_preference_change_requests (cycle_id, status, created_at);

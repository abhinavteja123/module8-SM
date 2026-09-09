-- Central, CRCS-controlled operational locks.  A lock is never deleted:
-- its current state is updated here and every transition is retained in audit_log.
CREATE TABLE IF NOT EXISTS portal_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_type TEXT NOT NULL CHECK (lock_type IN ('student_portal', 'faculty_projects')),
  subject_id UUID NOT NULL REFERENCES users(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES users(id),
  unlocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lock_type, subject_id)
);

CREATE INDEX IF NOT EXISTS portal_locks_active_lookup_idx
  ON portal_locks (lock_type, subject_id) WHERE is_locked;

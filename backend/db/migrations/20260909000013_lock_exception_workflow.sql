-- Extend the CRCS lock registry with faculty-workspace controls and an auditable
-- request/decision workflow.  Requests are never overwritten; decisions retain
-- the original requester, reason, reviewer, and time.
ALTER TABLE portal_locks DROP CONSTRAINT IF EXISTS portal_locks_lock_type_check;
ALTER TABLE portal_locks ADD CONSTRAINT portal_locks_lock_type_check CHECK (
  lock_type IN ('student_portal', 'faculty_projects', 'faculty_assignments', 'faculty_marks')
);

CREATE TABLE IF NOT EXISTS portal_unlock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id UUID NOT NULL REFERENCES portal_locks(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_unlock_requests_pending_idx
  ON portal_unlock_requests (status, created_at) WHERE status = 'pending';

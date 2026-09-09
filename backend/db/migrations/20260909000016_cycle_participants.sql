-- Explicit membership lets a person belong to more than one cycle while
-- keeping each dashboard, import, and permission check bound to one cycle.
CREATE TABLE IF NOT EXISTS cycle_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  participant_type TEXT NOT NULL CHECK (participant_type IN ('student', 'faculty')),
  category TEXT,
  department_id UUID REFERENCES departments(id),
  school_id UUID REFERENCES schools(id),
  source TEXT NOT NULL DEFAULT 'existing' CHECK (source IN ('existing', 'bulk_import')),
  enrolled_by UUID REFERENCES users(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, user_id)
);

CREATE INDEX IF NOT EXISTS cycle_participants_cycle_type_idx
  ON cycle_participants (cycle_id, participant_type);

CREATE INDEX IF NOT EXISTS cycle_participants_user_idx
  ON cycle_participants (user_id, cycle_id);

CREATE INDEX IF NOT EXISTS cycle_participants_scope_idx
  ON cycle_participants (department_id, school_id, cycle_id);

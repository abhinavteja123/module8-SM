-- Platform-level tenant lifecycle.  Deactivation is deliberately separate
-- from user activation: it pauses an entire university without changing the
-- individual account states that must be retained when it is reactivated.
ALTER TABLE universities
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS universities_active_name_idx
  ON universities (is_active, name);

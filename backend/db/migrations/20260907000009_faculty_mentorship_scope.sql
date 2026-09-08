ALTER TABLE faculty
  ADD COLUMN IF NOT EXISTS mentorship_scope TEXT NOT NULL DEFAULT 'research'
  CHECK (mentorship_scope IN ('research', 'crcs_self'));

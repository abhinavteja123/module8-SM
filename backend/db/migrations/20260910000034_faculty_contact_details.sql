-- Faculty contact details are shown to students before research applications
-- and after a mentor is assigned to any internship pathway.
ALTER TABLE faculty
  ADD COLUMN IF NOT EXISTS cabin TEXT;

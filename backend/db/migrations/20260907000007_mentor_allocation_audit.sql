-- Keep the latest editor on post-approval mentor mappings for quick accountability.
ALTER TABLE opportunity_applications
  ADD COLUMN IF NOT EXISTS mentor_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE self_internships
  ADD COLUMN IF NOT EXISTS mentor_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mentor_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;

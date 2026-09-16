-- CRCS-editable capacity limits, per university. A missing row means the app
-- falls back to the historical hardcoded defaults (4 / 4 / 5) — see
-- backend/src/lib/portalSettings.js — so no backfill is required for
-- existing universities.
CREATE TABLE IF NOT EXISTS portal_settings (
  university_id UUID PRIMARY KEY REFERENCES universities(id),
  max_students_per_project INT NOT NULL DEFAULT 4 CHECK (max_students_per_project BETWEEN 1 AND 50),
  max_projects_per_faculty INT NOT NULL DEFAULT 4 CHECK (max_projects_per_faculty BETWEEN 1 AND 50),
  max_mentees_per_faculty INT NOT NULL DEFAULT 5 CHECK (max_mentees_per_faculty BETWEEN 1 AND 50),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Whether a configured report requirement contributes to the academic mark.
-- Proof/checklist uploads remain requirements, but must not be inferred from a
-- mutable display title when totals are calculated.
ALTER TABLE report_requirements
  ADD COLUMN IF NOT EXISTS is_assessed BOOLEAN NOT NULL DEFAULT true;

-- These were the only legacy proof requirements intentionally excluded by the
-- former application code. The classification is durable after administrators
-- rename them, and new requirements default to assessed.
UPDATE report_requirements
SET is_assessed = false
WHERE lower(trim(title)) IN ('joining report', 'internship completion certificate');

CREATE INDEX IF NOT EXISTS report_requirements_assessed_idx
  ON report_requirements (is_active, is_assessed, track, sort_order);

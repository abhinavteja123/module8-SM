-- Structured department eligibility for CRCS opportunities. An empty array
-- means every department is eligible.
ALTER TABLE crcs_opportunities
  ADD COLUMN IF NOT EXISTS eligible_department_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS crcs_opportunities_eligible_departments_idx
  ON crcs_opportunities USING GIN (eligible_department_ids);

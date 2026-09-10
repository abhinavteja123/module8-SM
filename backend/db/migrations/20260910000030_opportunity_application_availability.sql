-- Administrators can temporarily close applications without archiving the
-- opportunity. A date deadline remains the automatic closure rule.
ALTER TABLE crcs_opportunities
  ADD COLUMN IF NOT EXISTS accepting_applications BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS crcs_opportunities_application_availability_idx
  ON crcs_opportunities (cycle_id, is_active, accepting_applications, application_deadline);

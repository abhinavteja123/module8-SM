-- Opportunity CRUD enhancements. Safe to apply to an existing deployment.
ALTER TABLE crcs_opportunities ADD COLUMN IF NOT EXISTS application_url TEXT;
ALTER TABLE crcs_opportunities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS crcs_opportunities_active_cycle_idx ON crcs_opportunities (cycle_id, is_active, application_deadline);

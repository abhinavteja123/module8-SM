-- CRCS publishes both campus-exclusive roles and open-source external roles.
-- Existing listings were campus roles, so preserve that behaviour by default.
ALTER TABLE crcs_opportunities
  ADD COLUMN IF NOT EXISTS opportunity_type TEXT NOT NULL DEFAULT 'exclusive';

ALTER TABLE crcs_opportunities
  DROP CONSTRAINT IF EXISTS crcs_opportunities_type_check;
ALTER TABLE crcs_opportunities
  ADD CONSTRAINT crcs_opportunities_type_check
  CHECK (opportunity_type IN ('exclusive', 'open_source'));

-- An open-source applicant reports their external selection back to CRCS.
ALTER TABLE opportunity_applications
  ADD COLUMN IF NOT EXISTS offer_letter_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE opportunity_applications
  ADD COLUMN IF NOT EXISTS external_offer_details JSONB;

CREATE INDEX IF NOT EXISTS crcs_opportunities_cycle_type_idx
  ON crcs_opportunities (cycle_id, opportunity_type, is_active, application_deadline);

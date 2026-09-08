-- A structured CGPA threshold lets CRCS set, display, and validate eligibility consistently.
ALTER TABLE crcs_opportunities ADD COLUMN IF NOT EXISTS minimum_cgpa NUMERIC(3,2);
ALTER TABLE crcs_opportunities DROP CONSTRAINT IF EXISTS crcs_opportunities_minimum_cgpa_check;
ALTER TABLE crcs_opportunities ADD CONSTRAINT crcs_opportunities_minimum_cgpa_check
  CHECK (minimum_cgpa IS NULL OR (minimum_cgpa >= 0 AND minimum_cgpa <= 10));

-- CRCS needs an accountable employer contact to verify direct internship offers.
-- Nullable preserves historical self-internship requests created before this field.
ALTER TABLE self_internships
  ADD COLUMN IF NOT EXISTS hr_name TEXT,
  ADD COLUMN IF NOT EXISTS hr_contact TEXT;

COMMENT ON COLUMN self_internships.hr_name IS 'Named HR or employer contact for a self-internship offer.';
COMMENT ON COLUMN self_internships.hr_contact IS 'Work phone number or email for the named HR/employer contact.';

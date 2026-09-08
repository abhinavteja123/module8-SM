-- Required information collected with a self-internship request.
ALTER TABLE self_internships
  ADD COLUMN IF NOT EXISTS company_website TEXT,
  ADD COLUMN IF NOT EXISTS company_address TEXT,
  ADD COLUMN IF NOT EXISTS offer_source TEXT;

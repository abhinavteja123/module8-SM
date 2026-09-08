-- Optional student application answers and resume/document linkage.
ALTER TABLE opportunity_applications ADD COLUMN IF NOT EXISTS application_answers JSONB;
ALTER TABLE opportunity_applications ADD COLUMN IF NOT EXISTS resume_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS opportunity_applications_opportunity_created_idx ON opportunity_applications (opportunity_id, created_at DESC);

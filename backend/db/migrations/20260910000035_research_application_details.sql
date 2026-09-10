-- Optional student application answers and resume/document linkage for research applications.
ALTER TABLE research_applications ADD COLUMN IF NOT EXISTS application_answers JSONB;
ALTER TABLE research_applications ADD COLUMN IF NOT EXISTS resume_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL;

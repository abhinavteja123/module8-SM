-- Administrator-published guidance and dynamically configured report assessment.
CREATE TABLE IF NOT EXISTS programme_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'guideline',
  audience TEXT NOT NULL DEFAULT 'all',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_id UUID NOT NULL UNIQUE REFERENCES report_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  track track_enum,
  description TEXT,
  max_marks NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (max_marks >= 0),
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  guidance_document_id UUID REFERENCES programme_documents(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_report_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id) ON DELETE CASCADE,
  report_requirement_id UUID NOT NULL REFERENCES report_requirements(id) ON DELETE CASCADE,
  score NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  entered_by UUID NOT NULL REFERENCES users(id),
  last_overridden_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, cycle_id, report_requirement_id)
);

CREATE INDEX IF NOT EXISTS programme_documents_active_idx ON programme_documents (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS report_requirements_active_idx ON report_requirements (is_active, track, sort_order);
CREATE INDEX IF NOT EXISTS student_report_scores_lookup_idx ON student_report_scores (student_id, cycle_id);

-- Cycle-specific PDF policies. A replacement gets a new row/version so prior
-- acknowledgements can never satisfy a revised document.
CREATE TABLE IF NOT EXISTS cycle_guideline_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  replaces_document_id UUID REFERENCES cycle_guideline_documents(id),
  retired_at TIMESTAMPTZ,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cycle_guideline_documents_current_idx
  ON cycle_guideline_documents (cycle_id, is_required, created_at DESC)
  WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS cycle_guideline_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES cycle_guideline_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS cycle_guideline_acknowledgements_user_cycle_idx
  ON cycle_guideline_acknowledgements (user_id, cycle_id);

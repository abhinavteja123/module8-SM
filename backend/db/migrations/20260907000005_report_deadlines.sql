CREATE TABLE IF NOT EXISTS report_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  research_application_id UUID NOT NULL REFERENCES research_applications(id),
  report_template_id UUID REFERENCES report_templates(id),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_deadlines_student_due_idx
  ON report_deadlines (student_id, due_at);

CREATE INDEX IF NOT EXISTS report_deadlines_reminder_idx
  ON report_deadlines (reminder_sent_at, due_at);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS report_deadline_id UUID REFERENCES report_deadlines(id);

-- Internship outcome details (mode, paid/unpaid, stipend, country, domain) for
-- department-wise placement analytics. Deliberately a separate table with zero
-- existing readers: self_internships/opportunity_applications are already
-- selected wholesale into faculty/coordinator/CRCS "view student" screens, so
-- adding these columns there would leak them by default. Analytics dashboards
-- are the only intended reader (see backend/src/routes/analytics.js).

CREATE TABLE internship_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  university_id UUID NOT NULL REFERENCES universities(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('self_internship', 'crcs_opportunity')),
  source_id UUID NOT NULL,
  mode TEXT CHECK (mode IN ('online', 'offline')),
  duration_months NUMERIC(4,1),
  nature TEXT NOT NULL CHECK (nature IN ('paid', 'unpaid')),
  stipend_amount NUMERIC(10,2),
  company_country TEXT,
  domain_sector TEXT,
  recruiter_feedback_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  submitted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX internship_outcomes_university_cycle_idx ON internship_outcomes(university_id, cycle_id);
CREATE INDEX internship_outcomes_student_idx ON internship_outcomes(student_id);

-- Programme granularity (e.g. "B.Tech" vs "M.Tech" within the same department)
-- has no representation anywhere in the schema today; departments are flat
-- subject rows. Needed so department-wise dashboards can match the source
-- audit's rows. CRCS/admin-set at creation, same tier as roll_number.
ALTER TABLE students ADD COLUMN program_level TEXT CHECK (program_level IN ('UG', 'PG'));
ALTER TABLE students ADD COLUMN programme_name TEXT;

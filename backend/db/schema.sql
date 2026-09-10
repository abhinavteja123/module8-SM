-- ============ ORG STRUCTURE ============
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ USERS & ROLES ============
CREATE TYPE role_enum AS ENUM (
  'student', 'faculty', 'faculty_coordinator',
  'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role_enum NOT NULL,
  department_id UUID REFERENCES departments(id),
  school_id UUID REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role, department_id)
);

CREATE TABLE students (
  id UUID PRIMARY KEY REFERENCES users(id),
  roll_number TEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES departments(id),
  batch_year INT NOT NULL,
  cgpa NUMERIC(4,2),
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE faculty (
  id UUID PRIMARY KEY REFERENCES users(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  designation TEXT,
  cabin TEXT,
  mentorship_scope TEXT NOT NULL DEFAULT 'research' CHECK (mentorship_scope IN ('research', 'crcs_self')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE faculty_coordinator_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES users(id),
  faculty_id UUID NOT NULL REFERENCES faculty(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coordinator_id, faculty_id),
  UNIQUE(faculty_id)
);

CREATE TABLE crcs_coordinator_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES users(id),
  permission_key TEXT NOT NULL,
  granted BOOLEAN DEFAULT false,
  granted_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coordinator_id, permission_key)
);

-- ============ CRCS OPERATIONAL LOCKS ============
CREATE TABLE portal_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_type TEXT NOT NULL CHECK (lock_type IN ('student_portal', 'faculty_projects', 'faculty_assignments', 'faculty_marks')),
  subject_id UUID NOT NULL REFERENCES users(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES users(id),
  unlocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lock_type, subject_id)
);

CREATE TABLE portal_unlock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id UUID NOT NULL REFERENCES portal_locks(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ TRACK SELECTION ============
CREATE TYPE track_enum AS ENUM ('research', 'crcs_opportunity', 'self_internship');
CREATE TYPE cycle_status_enum AS ENUM ('not_started', 'open', 'closed');

CREATE TABLE internship_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  preference_window_opens_at TIMESTAMPTZ NOT NULL,
  preference_window_closes_at TIMESTAMPTZ,
  preference_changes_locked BOOLEAN NOT NULL DEFAULT false,
  status cycle_status_enum DEFAULT 'not_started',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE student_track_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  track track_enum NOT NULL,
  questionnaire_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, cycle_id, track)
);

CREATE TABLE student_preference_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  current_track track_enum NOT NULL,
  requested_track track_enum NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE questionnaire_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  schema JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ TRACK A: RESEARCH INTERNSHIP ============
CREATE TYPE project_status_enum AS ENUM ('open', 'locked', 'full', 'closed');

CREATE TABLE research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculty(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  max_students INT NOT NULL DEFAULT 4 CHECK (max_students <= 4),
  approved_count INT NOT NULL DEFAULT 0,
  status project_status_enum DEFAULT 'open',
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE application_status_enum AS ENUM (
  'pending_faculty', 'faculty_approved', 'pending_crcs_approval',
  'crcs_approved', 'rejected', 'revoked'
);

CREATE TABLE research_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  project_id UUID NOT NULL REFERENCES research_projects(id),
  status application_status_enum DEFAULT 'pending_faculty',
  faculty_decision_by UUID REFERENCES users(id),
  faculty_decision_at TIMESTAMPTZ,
  crcs_decision_by UUID REFERENCES users(id),
  crcs_decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  rejected_by_role role_enum,
  rejected_at_stage TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mentor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  research_application_id UUID REFERENCES research_applications(id),
  related_entity_type TEXT CHECK (related_entity_type IN ('research_application', 'opportunity_application', 'self_internship')),
  related_entity_id UUID,
  faculty_id UUID NOT NULL REFERENCES faculty(id),
  is_current BOOLEAN DEFAULT true,
  reassigned_from UUID REFERENCES mentor_assignments(id),
  reassigned_by UUID REFERENCES users(id),
  reassignment_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE weekly_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_assignment_id UUID NOT NULL REFERENCES mentor_assignments(id),
  week_number INT NOT NULL,
  present BOOLEAN NOT NULL,
  marked_by UUID REFERENCES users(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mentor_assignment_id, week_number)
);

-- ============ TRACK B: OPPORTUNITY BY CRCS ============
CREATE TABLE crcs_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  title TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  description TEXT,
  eligibility TEXT,
  eligible_department_ids UUID[] NOT NULL DEFAULT '{}',
  minimum_cgpa NUMERIC(3,2) CHECK (minimum_cgpa >= 0 AND minimum_cgpa <= 10),
  application_deadline TIMESTAMPTZ,
  application_url TEXT,
  opportunity_type TEXT NOT NULL DEFAULT 'exclusive' CHECK (opportunity_type IN ('exclusive', 'open_source')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  posted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE opportunity_app_status_enum AS ENUM (
  'applied', 'under_review', 'offered', 'crcs_approved', 'rejected', 'revoked'
);

CREATE TABLE opportunity_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  opportunity_id UUID NOT NULL REFERENCES crcs_opportunities(id),
  status opportunity_app_status_enum DEFAULT 'applied',
  decision_by UUID REFERENCES users(id),
  decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  application_answers JSONB,
  resume_doc_id UUID,
  offer_letter_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  external_offer_details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============ TRACK C: SELF-INTERNSHIP ============
CREATE TYPE self_internship_status_enum AS ENUM (
  'submitted', 'mentor_approved', 'crcs_approved', 'rejected', 'revoked', 'active', 'completed'
);

CREATE TABLE self_internships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  company_name TEXT NOT NULL,
  company_website TEXT,
  company_address TEXT,
  offer_source TEXT,
  company_profile_doc_id UUID,
  offer_letter_doc_id UUID,
  certificate_doc_id UUID,
  status self_internship_status_enum DEFAULT 'submitted',
  assigned_mentor_id UUID REFERENCES faculty(id),
  mentor_decision_by UUID REFERENCES users(id),
  mentor_decision_at TIMESTAMPTZ,
  crcs_decision_by UUID REFERENCES users(id),
  crcs_decision_at TIMESTAMPTZ,
  rejection_reason TEXT,
  rejected_by_role role_enum,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============ SHARED: REPORT TEMPLATES & DOCUMENTS ============
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  track track_enum,
  is_default BOOLEAN DEFAULT false,
  schema JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE programme_documents (
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

CREATE TABLE report_requirements (
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

CREATE TYPE doc_review_status_enum AS ENUM ('pending', 'verified', 'revision_requested');

CREATE TABLE report_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  research_application_id UUID NOT NULL REFERENCES research_applications(id),
  report_template_id UUID REFERENCES report_templates(id),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  report_template_id UUID REFERENCES report_templates(id),
  related_entity_type TEXT NOT NULL,
  related_entity_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  week_number INT,
  review_status doc_review_status_enum DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  report_deadline_id UUID REFERENCES report_deadlines(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- ============ SHARED: MARKS ============
CREATE TABLE marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  cycle_id UUID NOT NULL REFERENCES internship_cycles(id),
  weekly_report_score NUMERIC(5,2),
  mid_marks NUMERIC(5,2),
  synopsis_marks NUMERIC(5,2),
  thesis_marks NUMERIC(5,2),
  ppt_marks NUMERIC(5,2),
  viva_marks NUMERIC(5,2),
  entered_by UUID REFERENCES users(id),
  last_overridden_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, cycle_id)
);

CREATE TABLE student_report_scores (
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

CREATE TABLE marks_override_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marks_id UUID NOT NULL REFERENCES marks(id),
  field_name TEXT NOT NULL,
  old_value NUMERIC(5,2),
  new_value NUMERIC(5,2),
  overridden_by UUID NOT NULL REFERENCES users(id),
  overridden_at TIMESTAMPTZ DEFAULT now()
);

-- ============ AUDIT LOG ============
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_role role_enum,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ NOTIFICATIONS ============
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cycle analytics is deliberately computed in Postgres.  The API supplies scope
-- parameters derived from the signed-in user's roles; callers never supply an
-- authority-defining department or school identifier.

CREATE INDEX IF NOT EXISTS student_track_selections_cycle_student_idx
  ON student_track_selections (cycle_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS research_projects_cycle_idx
  ON research_projects (cycle_id, id);
CREATE INDEX IF NOT EXISTS research_applications_project_status_idx
  ON research_applications (project_id, status, created_at);
CREATE INDEX IF NOT EXISTS crcs_opportunities_cycle_idx
  ON crcs_opportunities (cycle_id, id);
CREATE INDEX IF NOT EXISTS opportunity_applications_opportunity_status_idx
  ON opportunity_applications (opportunity_id, status, created_at);
CREATE INDEX IF NOT EXISTS self_internships_cycle_status_idx
  ON self_internships (cycle_id, status, created_at);
CREATE INDEX IF NOT EXISTS mentor_assignments_current_student_idx
  ON mentor_assignments (student_id, faculty_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS cycle_guideline_acknowledgements_document_user_idx
  ON cycle_guideline_acknowledgements (document_id, user_id);

-- A metric is self-describing: clients can show the value, and auditors can
-- inspect its numerator, denominator, exclusions, and calculation time.
CREATE OR REPLACE FUNCTION analytics_metric(
  p_value NUMERIC,
  p_numerator NUMERIC DEFAULT NULL,
  p_denominator NUMERIC DEFAULT NULL,
  p_exclusions TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'value', COALESCE(p_value, 0),
    'numerator', p_numerator,
    'denominator', p_denominator,
    'exclusions', to_jsonb(COALESCE(p_exclusions, ARRAY[]::TEXT[])),
    'calculated_at', now()
  );
$$;

-- All scope-sensitive CTEs start with the enrolled audience.  Faculty scope is
-- further limited to students they currently mentor in the selected cycle.
CREATE OR REPLACE FUNCTION analytics_cycle_overview(
  p_cycle_id UUID,
  p_department_ids UUID[] DEFAULT NULL,
  p_school_ids UUID[] DEFAULT NULL,
  p_faculty_id UUID DEFAULT NULL,
  p_is_system BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE sql STABLE AS $$
WITH
scope_participants AS (
  SELECT cp.*
  FROM cycle_participants cp
  WHERE cp.cycle_id = p_cycle_id
    AND (
      p_is_system
      OR p_faculty_id IS NOT NULL
      OR (COALESCE(array_length(p_department_ids, 1), 0) > 0 AND cp.department_id = ANY(p_department_ids))
      OR (COALESCE(array_length(p_school_ids, 1), 0) > 0 AND cp.school_id = ANY(p_school_ids))
    )
),
mentor_student_ids AS (
  SELECT DISTINCT ra.student_id
  FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id
  WHERE rp.cycle_id = p_cycle_id AND rp.faculty_id = p_faculty_id AND ra.status = 'crcs_approved'
  UNION
  SELECT DISTINCT oa.student_id
  FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id
  WHERE co.cycle_id = p_cycle_id AND oa.assigned_mentor_id = p_faculty_id AND oa.status = 'crcs_approved'
  UNION
  SELECT DISTINCT si.student_id FROM self_internships si
  WHERE si.cycle_id = p_cycle_id AND si.assigned_mentor_id = p_faculty_id
    AND si.status IN ('active', 'completed')
),
scoped_students AS (
  SELECT sp.user_id AS student_id, sp.department_id, sp.school_id
  FROM scope_participants sp
  WHERE sp.participant_type = 'student'
    AND (p_faculty_id IS NULL OR sp.user_id IN (SELECT student_id FROM mentor_student_ids))
),
scoped_faculty AS (
  SELECT sp.user_id AS faculty_id FROM scope_participants sp
  WHERE sp.participant_type = 'faculty'
    AND (p_faculty_id IS NULL OR sp.user_id = p_faculty_id)
),
selections AS (
  SELECT sts.* FROM student_track_selections sts
  JOIN scoped_students ss ON ss.student_id = sts.student_id
  WHERE sts.cycle_id = p_cycle_id
),
research_apps AS (
  SELECT ra.*, rp.faculty_id, rp.max_students
  FROM research_applications ra
  JOIN research_projects rp ON rp.id = ra.project_id AND rp.cycle_id = p_cycle_id
  JOIN scoped_students ss ON ss.student_id = ra.student_id
),
opportunity_apps AS (
  SELECT oa.* FROM opportunity_applications oa
  JOIN crcs_opportunities co ON co.id = oa.opportunity_id AND co.cycle_id = p_cycle_id
  JOIN scoped_students ss ON ss.student_id = oa.student_id
),
self_apps AS (
  SELECT si.* FROM self_internships si
  JOIN scoped_students ss ON ss.student_id = si.student_id
  WHERE si.cycle_id = p_cycle_id
),
all_application_events AS (
  SELECT 'research'::TEXT AS track, id, student_id, status::TEXT, created_at, faculty_decision_at AS faculty_at, crcs_decision_at AS crcs_at
  FROM research_apps
  UNION ALL
  SELECT 'crcs_opportunity', id, student_id, status::TEXT, created_at, NULL::TIMESTAMPTZ, decision_at FROM opportunity_apps
  UNION ALL
  SELECT 'self_internship', id, student_id, status::TEXT, created_at, mentor_decision_at, crcs_decision_at FROM self_apps
),
active_students AS (
  SELECT student_id FROM research_apps WHERE status = 'crcs_approved'
  UNION SELECT student_id FROM opportunity_apps WHERE status = 'crcs_approved'
  UNION SELECT student_id FROM self_apps WHERE status IN ('active', 'completed')
),
completed_students AS (
  SELECT m.student_id FROM marks m JOIN scoped_students ss ON ss.student_id = m.student_id
  WHERE m.cycle_id = p_cycle_id
  UNION
  SELECT student_id FROM self_apps WHERE status = 'completed'
),
required_documents AS (
  SELECT id FROM cycle_guideline_documents
  WHERE cycle_id = p_cycle_id AND is_required AND retired_at IS NULL
),
overdue_deadlines AS (
  SELECT rd.* FROM report_deadlines rd JOIN scoped_students ss ON ss.student_id = rd.student_id
  WHERE rd.due_at < now()
    AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.report_deadline_id = rd.id)
),
unassigned_active AS (
  SELECT ra.student_id FROM research_apps ra
  WHERE ra.status = 'crcs_approved' AND NOT EXISTS (
    SELECT 1 FROM mentor_assignments ma WHERE ma.research_application_id = ra.id AND ma.is_current
  )
  UNION
  SELECT student_id FROM opportunity_apps WHERE status = 'crcs_approved' AND assigned_mentor_id IS NULL
  UNION
  SELECT student_id FROM self_apps WHERE status IN ('active', 'completed') AND assigned_mentor_id IS NULL
),
duplicate_active AS (
  SELECT student_id FROM active_students GROUP BY student_id HAVING count(*) > 1
),
missing_enrolment AS (
  SELECT DISTINCT candidate.student_id
  FROM (
    SELECT sts.student_id FROM student_track_selections sts WHERE sts.cycle_id = p_cycle_id
    UNION SELECT ra.student_id FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id WHERE rp.cycle_id = p_cycle_id
    UNION SELECT oa.student_id FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id WHERE co.cycle_id = p_cycle_id
    UNION SELECT si.student_id FROM self_internships si WHERE si.cycle_id = p_cycle_id
  ) candidate
  JOIN students s ON s.id = candidate.student_id
  LEFT JOIN departments d ON d.id = s.department_id
  LEFT JOIN cycle_participants cp ON cp.cycle_id = p_cycle_id AND cp.user_id = candidate.student_id
  WHERE cp.id IS NULL AND (
    p_is_system
    OR (COALESCE(array_length(p_department_ids, 1), 0) > 0 AND s.department_id = ANY(p_department_ids))
    OR (COALESCE(array_length(p_school_ids, 1), 0) > 0 AND d.school_id = ANY(p_school_ids))
  )
),
inconsistent_status AS (
  SELECT id FROM research_apps WHERE (status = 'crcs_approved' AND crcs_decision_at IS NULL)
    OR (status IN ('faculty_approved', 'pending_crcs_approval') AND faculty_decision_at IS NULL)
  UNION
  SELECT id FROM self_apps WHERE (status IN ('mentor_approved', 'crcs_approved', 'active', 'completed') AND mentor_decision_at IS NULL)
    OR (status IN ('crcs_approved', 'active', 'completed') AND crcs_decision_at IS NULL)
  UNION
  SELECT id FROM opportunity_apps WHERE status IN ('offered', 'crcs_approved', 'rejected') AND decision_at IS NULL
),
capacity_risk AS (
  SELECT rp.faculty_id
  FROM research_projects rp JOIN scoped_faculty sf ON sf.faculty_id = rp.faculty_id
  WHERE rp.cycle_id = p_cycle_id AND rp.approved_count >= rp.max_students
  GROUP BY rp.faculty_id
),
pending_unlocks AS (
  SELECT pur.id FROM portal_unlock_requests pur JOIN portal_locks pl ON pl.id = pur.lock_id
  JOIN scope_participants sp ON sp.user_id = pl.subject_id
  WHERE pur.status = 'pending'
),
missing_acknowledgements AS (
  SELECT ss.student_id, rd.id AS document_id FROM scoped_students ss CROSS JOIN required_documents rd
  LEFT JOIN cycle_guideline_acknowledgements cga ON cga.document_id = rd.id AND cga.user_id = ss.student_id
  WHERE cga.id IS NULL
)
SELECT jsonb_build_object(
  'cycle_id', p_cycle_id,
  'calculated_at', now(),
  'metrics', jsonb_build_object(
    'enrolled_students', analytics_metric((SELECT count(*) FROM scoped_students), (SELECT count(*) FROM scoped_students), NULL, ARRAY['Inactive directory users are excluded by enrolment.']),
    'selected_students', analytics_metric((SELECT count(DISTINCT student_id) FROM selections), (SELECT count(DISTINCT student_id) FROM selections), (SELECT count(*) FROM scoped_students), ARRAY['Students without a recorded track selection are excluded from numerator.']),
    'applications_submitted', analytics_metric((SELECT count(*) FROM all_application_events), (SELECT count(*) FROM all_application_events), (SELECT count(DISTINCT student_id) FROM selections), ARRAY['Revoked and rejected applications remain included as submitted history.']),
    'approval_rate', analytics_metric(
      100 * (SELECT count(*) FROM active_students)::NUMERIC / NULLIF((SELECT count(*) FROM all_application_events WHERE status NOT IN ('revoked')), 0),
      (SELECT count(*) FROM active_students), (SELECT count(*) FROM all_application_events WHERE status NOT IN ('revoked')),
      ARRAY['Revoked applications are excluded from the denominator.']
    ),
    'active_internships', analytics_metric((SELECT count(*) FROM active_students), (SELECT count(*) FROM active_students), NULL, ARRAY[]::TEXT[]),
    'completed_internships', analytics_metric((SELECT count(*) FROM completed_students), (SELECT count(*) FROM completed_students), (SELECT count(*) FROM active_students), ARRAY['Completion is inferred from marks entry or an explicit self-internship completed status.']),
    'average_faculty_review_hours', analytics_metric((SELECT round(avg(extract(epoch FROM faculty_at - created_at) / 3600.0)::NUMERIC, 2) FROM all_application_events WHERE faculty_at IS NOT NULL), NULL, (SELECT count(*) FROM all_application_events WHERE faculty_at IS NOT NULL), ARRAY['CRCS opportunity applications do not have a faculty review stage.']),
    'average_crcs_decision_hours', analytics_metric((SELECT round(avg(extract(epoch FROM crcs_at - COALESCE(faculty_at, created_at)) / 3600.0)::NUMERIC, 2) FROM all_application_events WHERE crcs_at IS NOT NULL), NULL, (SELECT count(*) FROM all_application_events WHERE crcs_at IS NOT NULL), ARRAY['Measures from the preceding decision when available, otherwise application submission.'])
  ),
  'funnel', jsonb_build_object(
    'selected', analytics_metric((SELECT count(DISTINCT student_id) FROM selections), NULL, (SELECT count(*) FROM scoped_students), ARRAY[]::TEXT[]),
    'application', analytics_metric((SELECT count(*) FROM all_application_events), NULL, (SELECT count(DISTINCT student_id) FROM selections), ARRAY[]::TEXT[]),
    'faculty_review', analytics_metric((SELECT count(*) FROM all_application_events WHERE status IN ('pending_faculty', 'submitted')), NULL, (SELECT count(*) FROM all_application_events), ARRAY['CRCS opportunities bypass faculty review.']),
    'crcs_review', analytics_metric((SELECT count(*) FROM all_application_events WHERE status IN ('faculty_approved', 'pending_crcs_approval', 'applied', 'under_review', 'offered', 'mentor_approved', 'crcs_approved')), NULL, (SELECT count(*) FROM all_application_events), ARRAY[]::TEXT[]),
    'active', analytics_metric((SELECT count(*) FROM active_students), NULL, (SELECT count(*) FROM all_application_events), ARRAY[]::TEXT[]),
    'completed', analytics_metric((SELECT count(*) FROM completed_students), NULL, (SELECT count(*) FROM active_students), ARRAY[]::TEXT[])
  ),
  'workload', jsonb_build_object(
    'mentor_capacity_risk', analytics_metric((SELECT count(*) FROM capacity_risk), (SELECT count(*) FROM capacity_risk), (SELECT count(*) FROM scoped_faculty), ARRAY['Capacity is currently measured from research project maximums.']),
    'overdue_report_deadlines', analytics_metric((SELECT count(*) FROM overdue_deadlines), (SELECT count(*) FROM overdue_deadlines), NULL, ARRAY['A deadline is overdue only when no document has been uploaded for it.']),
    'reassignments', analytics_metric((SELECT count(*) FROM mentor_assignments ma JOIN scoped_students ss ON ss.student_id = ma.student_id WHERE ma.reassigned_from IS NOT NULL), NULL, NULL, ARRAY[]::TEXT[])
  ),
  'compliance', jsonb_build_object(
    'missing_required_acknowledgements', analytics_metric((SELECT count(*) FROM missing_acknowledgements), (SELECT count(*) FROM missing_acknowledgements), (SELECT count(*) FROM scoped_students) * (SELECT count(*) FROM required_documents), ARRAY['Only current, required cycle documents are counted.']),
    'pending_unlock_requests', analytics_metric((SELECT count(*) FROM pending_unlocks), (SELECT count(*) FROM pending_unlocks), NULL, ARRAY[]::TEXT[]),
    'policy_lock_exceptions', analytics_metric((SELECT count(*) FROM portal_unlock_requests pur JOIN portal_locks pl ON pl.id = pur.lock_id JOIN scope_participants sp ON sp.user_id = pl.subject_id WHERE pur.status = 'approved'), NULL, NULL, ARRAY['Approved unlock requests are treated as policy exceptions.'])
  ),
  'data_quality', jsonb_build_object(
    'unassigned_active_internships', analytics_metric((SELECT count(*) FROM unassigned_active), (SELECT count(*) FROM unassigned_active), (SELECT count(*) FROM active_students), ARRAY[]::TEXT[]),
    'missing_cycle_enrolment', analytics_metric((SELECT count(*) FROM missing_enrolment), (SELECT count(*) FROM missing_enrolment), NULL, ARRAY[]::TEXT[]),
    'duplicate_active_applications', analytics_metric((SELECT count(*) FROM duplicate_active), (SELECT count(*) FROM duplicate_active), NULL, ARRAY['Counts students with more than one active approved internship.']),
    'inconsistent_statuses', analytics_metric((SELECT count(*) FROM inconsistent_status), (SELECT count(*) FROM inconsistent_status), NULL, ARRAY['Checks decision timestamps required by the current workflow.']),
    'unavailable_evidence_files', analytics_metric((SELECT count(*) FROM documents d JOIN scoped_students ss ON ss.student_id = d.student_id WHERE d.file_path IS NULL OR btrim(d.file_path) = ''), NULL, NULL, ARRAY['Storage-object existence cannot be proven from relational metadata alone.'])
  ),
  'alerts', jsonb_build_array(
    jsonb_build_object('key', 'overdue_reports', 'severity', CASE WHEN (SELECT count(*) FROM overdue_deadlines) > 0 THEN 'warning' ELSE 'ok' END, 'count', (SELECT count(*) FROM overdue_deadlines)),
    jsonb_build_object('key', 'capacity_risk', 'severity', CASE WHEN (SELECT count(*) FROM capacity_risk) > 0 THEN 'warning' ELSE 'ok' END, 'count', (SELECT count(*) FROM capacity_risk)),
    jsonb_build_object('key', 'pending_reviews', 'severity', CASE WHEN (SELECT count(*) FROM all_application_events WHERE status IN ('pending_faculty', 'pending_crcs_approval', 'under_review', 'submitted', 'mentor_approved')) > 0 THEN 'warning' ELSE 'ok' END, 'count', (SELECT count(*) FROM all_application_events WHERE status IN ('pending_faculty', 'pending_crcs_approval', 'under_review', 'submitted', 'mentor_approved')))
  ),
  'definitions', jsonb_build_object(
    'approval_rate', 'Distinct active students divided by non-revoked submitted applications, expressed as a percentage.',
    'active_internships', 'Students with a CRCS-approved research/opportunity application or active/completed self internship.',
    'completed_internships', 'Students with marks entered in this cycle or an explicitly completed self internship.',
    'overdue_report_deadlines', 'Past due report deadlines with no uploaded document attached.',
    'missing_required_acknowledgements', 'Required, current cycle document acknowledgements missing from enrolled students.'
  )
);
$$;

-- Drill-downs deliberately return only records from the same scoped audience as
-- the overview.  The allowlist protects this function from becoming a generic,
-- unscoped people-search endpoint.
CREATE OR REPLACE FUNCTION analytics_cycle_drilldown(
  p_cycle_id UUID,
  p_metric TEXT,
  p_limit INTEGER DEFAULT 100,
  p_department_ids UUID[] DEFAULT NULL,
  p_school_ids UUID[] DEFAULT NULL,
  p_faculty_id UUID DEFAULT NULL,
  p_is_system BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE result JSONB;
BEGIN
  IF p_metric NOT IN ('pending_reviews', 'overdue_reports', 'missing_acknowledgements', 'unassigned_active_internships', 'duplicate_active_applications', 'missing_cycle_enrolment', 'capacity_risk', 'pending_unlock_requests', 'inconsistent_statuses') THEN
    RAISE EXCEPTION 'unsupported analytics drill-down metric: %', p_metric USING ERRCODE = '22023';
  END IF;

  WITH scope_participants AS (
    SELECT cp.* FROM cycle_participants cp WHERE cp.cycle_id = p_cycle_id AND (
      p_is_system OR p_faculty_id IS NOT NULL
      OR (COALESCE(array_length(p_department_ids, 1), 0) > 0 AND cp.department_id = ANY(p_department_ids))
      OR (COALESCE(array_length(p_school_ids, 1), 0) > 0 AND cp.school_id = ANY(p_school_ids))
    )
  ), scoped_students AS (
    SELECT sp.user_id AS student_id, sp.department_id FROM scope_participants sp
    WHERE sp.participant_type = 'student' AND (p_faculty_id IS NULL OR EXISTS (
      SELECT 1 FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id
      WHERE ra.student_id = sp.user_id AND rp.cycle_id = p_cycle_id AND rp.faculty_id = p_faculty_id AND ra.status = 'crcs_approved'
      UNION ALL SELECT 1 FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id
      WHERE oa.student_id = sp.user_id AND co.cycle_id = p_cycle_id AND oa.assigned_mentor_id = p_faculty_id AND oa.status = 'crcs_approved'
      UNION ALL SELECT 1 FROM self_internships si WHERE si.student_id = sp.user_id AND si.cycle_id = p_cycle_id AND si.assigned_mentor_id = p_faculty_id AND si.status IN ('active', 'completed')
    ))
  ), rows AS (
    SELECT 'pending_reviews' AS metric, ra.id::TEXT AS record_id, ra.student_id, u.full_name, s.roll_number, ss.department_id,
      ('Research: ' || ra.status::TEXT) AS detail, ra.created_at AS occurred_at
    FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id AND rp.cycle_id = p_cycle_id
    JOIN scoped_students ss ON ss.student_id = ra.student_id JOIN users u ON u.id = ra.student_id JOIN students s ON s.id = ra.student_id
    WHERE ra.status IN ('pending_faculty', 'pending_crcs_approval')
    UNION ALL
    SELECT 'pending_reviews', si.id::TEXT, si.student_id, u.full_name, s.roll_number, ss.department_id, ('Self internship: ' || si.status::TEXT), si.created_at
    FROM self_internships si JOIN scoped_students ss ON ss.student_id = si.student_id JOIN users u ON u.id = si.student_id JOIN students s ON s.id = si.student_id
    WHERE si.cycle_id = p_cycle_id AND si.status IN ('submitted', 'mentor_approved', 'crcs_approved')
    UNION ALL
    SELECT 'pending_reviews', oa.id::TEXT, oa.student_id, u.full_name, s.roll_number, ss.department_id, ('Opportunity: ' || oa.status::TEXT), oa.created_at
    FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id AND co.cycle_id = p_cycle_id
    JOIN scoped_students ss ON ss.student_id = oa.student_id JOIN users u ON u.id = oa.student_id JOIN students s ON s.id = oa.student_id
    WHERE oa.status IN ('applied', 'under_review', 'offered')
    UNION ALL
    SELECT 'overdue_reports', rd.id::TEXT, rd.student_id, u.full_name, s.roll_number, ss.department_id, rd.title, rd.due_at
    FROM report_deadlines rd JOIN scoped_students ss ON ss.student_id = rd.student_id JOIN users u ON u.id = rd.student_id JOIN students s ON s.id = rd.student_id
    WHERE rd.due_at < now() AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.report_deadline_id = rd.id)
    UNION ALL
    SELECT 'missing_acknowledgements', cgd.id::TEXT, ss.student_id, u.full_name, s.roll_number, ss.department_id, cgd.title, cgd.created_at
    FROM scoped_students ss CROSS JOIN cycle_guideline_documents cgd JOIN users u ON u.id = ss.student_id JOIN students s ON s.id = ss.student_id
    LEFT JOIN cycle_guideline_acknowledgements cga ON cga.document_id = cgd.id AND cga.user_id = ss.student_id
    WHERE cgd.cycle_id = p_cycle_id AND cgd.is_required AND cgd.retired_at IS NULL AND cga.id IS NULL
    UNION ALL
    SELECT 'unassigned_active_internships', ra.id::TEXT, ra.student_id, u.full_name, s.roll_number, ss.department_id, 'Research application has no current mentor', ra.created_at
    FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id AND rp.cycle_id = p_cycle_id JOIN scoped_students ss ON ss.student_id = ra.student_id JOIN users u ON u.id = ra.student_id JOIN students s ON s.id = ra.student_id
    WHERE ra.status = 'crcs_approved' AND NOT EXISTS (SELECT 1 FROM mentor_assignments ma WHERE ma.research_application_id = ra.id AND ma.is_current)
    UNION ALL
    SELECT 'unassigned_active_internships', oa.id::TEXT, oa.student_id, u.full_name, s.roll_number, ss.department_id, 'Opportunity application has no mentor', oa.created_at
    FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id AND co.cycle_id = p_cycle_id JOIN scoped_students ss ON ss.student_id = oa.student_id JOIN users u ON u.id = oa.student_id JOIN students s ON s.id = oa.student_id
    WHERE oa.status = 'crcs_approved' AND oa.assigned_mentor_id IS NULL
    UNION ALL
    SELECT 'unassigned_active_internships', si.id::TEXT, si.student_id, u.full_name, s.roll_number, ss.department_id, 'Self internship has no mentor', si.created_at
    FROM self_internships si JOIN scoped_students ss ON ss.student_id = si.student_id JOIN users u ON u.id = si.student_id JOIN students s ON s.id = si.student_id
    WHERE si.cycle_id = p_cycle_id AND si.status IN ('active', 'completed') AND si.assigned_mentor_id IS NULL
    UNION ALL
    SELECT 'duplicate_active_applications', da.student_id::TEXT, da.student_id, u.full_name, s.roll_number, ss.department_id,
      'More than one approved/active internship in this cycle', now()
    FROM (
      SELECT student_id FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id
      WHERE rp.cycle_id = p_cycle_id AND ra.status = 'crcs_approved'
      UNION ALL SELECT oa.student_id FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id
      WHERE co.cycle_id = p_cycle_id AND oa.status = 'crcs_approved'
      UNION ALL SELECT student_id FROM self_internships WHERE cycle_id = p_cycle_id AND status IN ('active', 'completed')
    ) active_events JOIN scoped_students ss ON ss.student_id = active_events.student_id
    JOIN users u ON u.id = active_events.student_id JOIN students s ON s.id = active_events.student_id
    GROUP BY active_events.student_id, ss.department_id, u.full_name, s.roll_number
    HAVING count(*) > 1
    UNION ALL
    SELECT 'missing_cycle_enrolment', candidate.student_id::TEXT, candidate.student_id, u.full_name, s.roll_number, s.department_id,
      'Workflow record exists without an enrolment in this cycle', now()
    FROM (
      SELECT student_id FROM student_track_selections WHERE cycle_id = p_cycle_id
      UNION SELECT ra.student_id FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id WHERE rp.cycle_id = p_cycle_id
      UNION SELECT oa.student_id FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id WHERE co.cycle_id = p_cycle_id
      UNION SELECT student_id FROM self_internships WHERE cycle_id = p_cycle_id
    ) candidate JOIN students s ON s.id = candidate.student_id JOIN users u ON u.id = candidate.student_id
    JOIN departments d ON d.id = s.department_id
    LEFT JOIN cycle_participants cp ON cp.cycle_id = p_cycle_id AND cp.user_id = candidate.student_id
    WHERE cp.id IS NULL AND (
      p_is_system OR (COALESCE(array_length(p_department_ids, 1), 0) > 0 AND s.department_id = ANY(p_department_ids))
      OR (COALESCE(array_length(p_school_ids, 1), 0) > 0 AND d.school_id = ANY(p_school_ids))
    )
    UNION ALL
    SELECT 'capacity_risk', rp.faculty_id::TEXT, NULL::UUID, u.full_name, NULL::TEXT, f.department_id,
      'Research project capacity is fully allocated', now()
    FROM research_projects rp JOIN faculty f ON f.id = rp.faculty_id JOIN users u ON u.id = rp.faculty_id
    WHERE rp.cycle_id = p_cycle_id AND rp.approved_count >= rp.max_students AND (
      p_is_system OR p_faculty_id = rp.faculty_id
      OR (COALESCE(array_length(p_department_ids, 1), 0) > 0 AND f.department_id = ANY(p_department_ids))
      OR (COALESCE(array_length(p_school_ids, 1), 0) > 0 AND EXISTS (SELECT 1 FROM departments d WHERE d.id = f.department_id AND d.school_id = ANY(p_school_ids)))
    )
    UNION ALL
    SELECT 'pending_unlock_requests', pur.id::TEXT, pl.subject_id, u.full_name, s.roll_number, sp.department_id,
      pur.reason, pur.created_at
    FROM portal_unlock_requests pur JOIN portal_locks pl ON pl.id = pur.lock_id JOIN scope_participants sp ON sp.user_id = pl.subject_id
    JOIN users u ON u.id = pl.subject_id LEFT JOIN students s ON s.id = pl.subject_id
    WHERE pur.status = 'pending'
    UNION ALL
    SELECT 'inconsistent_statuses', ra.id::TEXT, ra.student_id, u.full_name, s.roll_number, ss.department_id,
      'Research decision timestamp is missing for its current status', ra.created_at
    FROM research_applications ra JOIN research_projects rp ON rp.id = ra.project_id AND rp.cycle_id = p_cycle_id
    JOIN scoped_students ss ON ss.student_id = ra.student_id JOIN users u ON u.id = ra.student_id JOIN students s ON s.id = ra.student_id
    WHERE (ra.status = 'crcs_approved' AND ra.crcs_decision_at IS NULL) OR (ra.status IN ('faculty_approved', 'pending_crcs_approval') AND ra.faculty_decision_at IS NULL)
    UNION ALL
    SELECT 'inconsistent_statuses', si.id::TEXT, si.student_id, u.full_name, s.roll_number, ss.department_id,
      'Self internship decision timestamp is missing for its current status', si.created_at
    FROM self_internships si JOIN scoped_students ss ON ss.student_id = si.student_id JOIN users u ON u.id = si.student_id JOIN students s ON s.id = si.student_id
    WHERE si.cycle_id = p_cycle_id AND ((si.status IN ('mentor_approved', 'crcs_approved', 'active', 'completed') AND si.mentor_decision_at IS NULL) OR (si.status IN ('crcs_approved', 'active', 'completed') AND si.crcs_decision_at IS NULL))
    UNION ALL
    SELECT 'inconsistent_statuses', oa.id::TEXT, oa.student_id, u.full_name, s.roll_number, ss.department_id,
      'Opportunity decision timestamp is missing for its current status', oa.created_at
    FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id AND co.cycle_id = p_cycle_id
    JOIN scoped_students ss ON ss.student_id = oa.student_id JOIN users u ON u.id = oa.student_id JOIN students s ON s.id = oa.student_id
    WHERE oa.status IN ('offered', 'crcs_approved', 'rejected') AND oa.decision_at IS NULL
  )
  SELECT jsonb_build_object('metric', p_metric, 'calculated_at', now(), 'rows', COALESCE(jsonb_agg(to_jsonb(limited)), '[]'::JSONB)) INTO result
  FROM (SELECT record_id, student_id, full_name, roll_number, department_id, detail, occurred_at FROM rows WHERE metric = p_metric ORDER BY occurred_at ASC NULLS LAST LIMIT LEAST(GREATEST(p_limit, 1), 500)) limited;

  RETURN result;
END;
$$;

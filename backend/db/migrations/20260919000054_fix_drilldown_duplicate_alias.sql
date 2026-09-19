-- analytics_cycle_drilldown's duplicate_active_applications branch selected
-- `da.student_id` twice but the FROM clause aliases that subquery as
-- `active_events`, not `da` — a copy-paste typo present since the function's
-- original creation (20260909000019) and carried into the department-name
-- fix (20260919000053). Postgres errors on this at parse/plan time for the
-- WHOLE UNION ALL regardless of which p_metric was requested, so every
-- drill-down metric (including capacity_risk / "Mentor Capacity Risk") was
-- broken, not just duplicate_active_applications.
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
    SELECT 'duplicate_active_applications', active_events.student_id::TEXT, active_events.student_id, u.full_name, s.roll_number, ss.department_id,
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
  FROM (
    SELECT r.record_id, r.student_id, r.full_name, r.roll_number, d.name AS department_name, r.detail, r.occurred_at
    FROM rows r LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.metric = p_metric ORDER BY r.occurred_at ASC NULLS LAST LIMIT LEAST(GREATEST(p_limit, 1), 500)
  ) limited;

  RETURN result;
END;
$$;

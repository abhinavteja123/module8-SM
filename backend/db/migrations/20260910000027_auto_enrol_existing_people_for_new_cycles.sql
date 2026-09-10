-- A cycle is a complete roster snapshot by default. When a new draft/open
-- cycle is created, all active students and organisation users already in the
-- directory must join it just as users created later do.

CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people(p_cycle_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO cycle_participants (
    cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
  )
  SELECT DISTINCT ON (ur.user_id)
    p_cycle_id,
    ur.user_id,
    ur.role,
    ur.department_id,
    COALESCE(ur.school_id, d.school_id),
    'existing',
    NULL
  FROM user_roles ur
  JOIN users u ON u.id = ur.user_id AND u.is_active = true
  LEFT JOIN departments d ON d.id = ur.department_id
  WHERE ur.role IN ('student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office')
  ORDER BY ur.user_id,
    CASE ur.role
      WHEN 'student' THEN 1
      WHEN 'faculty_coordinator' THEN 2
      WHEN 'hod' THEN 3
      WHEN 'dean' THEN 4
      WHEN 'school_office' THEN 5
      ELSE 6
    END
  ON CONFLICT (cycle_id, user_id) DO UPDATE SET
    participant_type = EXCLUDED.participant_type,
    department_id = EXCLUDED.department_id,
    school_id = EXCLUDED.school_id;
$$;

-- Bring active cycles made after the prior auto-enrolment migration in line
-- with the same complete-roster rule.
SELECT enrol_fixed_organisation_people(id)
FROM internship_cycles
WHERE status IN ('not_started', 'open');

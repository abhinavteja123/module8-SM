-- Students belong only to the cycle where CRCS explicitly enrols them.  The
-- same directory account may later be selected again in Cycle Setup, but a
-- draft/open cycle must never inherit students merely because they joined an
-- earlier cycle.  Faculty and structural organisation roles retain the
-- established fixed-roster behaviour.

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
  WHERE ur.role IN ('faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office')
  ORDER BY ur.user_id,
    CASE ur.role
      WHEN 'faculty' THEN 1
      WHEN 'faculty_coordinator' THEN 2
      WHEN 'hod' THEN 3
      WHEN 'dean' THEN 4
      ELSE 5
    END
  ON CONFLICT (cycle_id, user_id) DO UPDATE SET
    participant_type = EXCLUDED.participant_type,
    department_id = EXCLUDED.department_id,
    school_id = EXCLUDED.school_id;
$$;

-- A newly created student joins the one currently published cycle only. It
-- does not leak into drafts or historical cycles; existing students are added
-- to a later cycle through its Add existing people workflow.
CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people_for_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office') THEN
    INSERT INTO cycle_participants (
      cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
    )
    SELECT
      cycle.id,
      NEW.user_id,
      NEW.role,
      NEW.department_id,
      COALESCE(NEW.school_id, department.school_id),
      'existing',
      NULL
    FROM internship_cycles cycle
    JOIN users u ON u.id = NEW.user_id AND u.is_active = true
    LEFT JOIN departments department ON department.id = NEW.department_id
    WHERE cycle.status IN ('not_started', 'open')
    ON CONFLICT (cycle_id, user_id) DO UPDATE SET
      participant_type = EXCLUDED.participant_type,
      department_id = EXCLUDED.department_id,
      school_id = EXCLUDED.school_id;
  ELSIF NEW.role = 'student' THEN
    INSERT INTO cycle_participants (
      cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
    )
    SELECT
      cycle.id,
      NEW.user_id,
      'student',
      NEW.department_id,
      COALESCE(NEW.school_id, department.school_id),
      'existing',
      NULL
    FROM internship_cycles cycle
    JOIN users u ON u.id = NEW.user_id AND u.is_active = true
    LEFT JOIN departments department ON department.id = NEW.department_id
    WHERE cycle.status = 'open'
    ON CONFLICT (cycle_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Remove the unintended student rows inserted by the prior all-cycle
-- backfill. Rows added through Cycle Setup always carry an enrolled_by value
-- and are preserved.
DELETE FROM cycle_participants cp
USING user_roles ur
WHERE cp.user_id = ur.user_id
  AND ur.role = 'student'
  AND cp.participant_type = 'student'
  AND cp.enrolled_by IS NULL;

-- Keep the live published cycle behaviour for newly created/student-directory
-- accounts after removing the broad historical/draft backfill.
INSERT INTO cycle_participants (
  cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
)
SELECT
  cycle.id,
  ur.user_id,
  'student',
  ur.department_id,
  COALESCE(ur.school_id, department.school_id),
  'existing',
  NULL
FROM internship_cycles cycle
JOIN user_roles ur ON ur.role = 'student'
JOIN users u ON u.id = ur.user_id AND u.is_active = true
LEFT JOIN departments department ON department.id = ur.department_id
WHERE cycle.status = 'open'
ON CONFLICT (cycle_id, user_id) DO NOTHING;

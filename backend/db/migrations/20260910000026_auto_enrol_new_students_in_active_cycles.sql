-- A published cycle stays open as its roster grows.  A student created after
-- publication is a participant immediately, so their acknowledgement gate and
-- roster/progress counts work without publishing the cycle a second time.
-- Organisation roles continue to use the same trigger as before.

CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people_for_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office') THEN
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
  END IF;
  RETURN NEW;
END;
$$;

-- Catch students made before this rollout but after an active cycle opened.
INSERT INTO cycle_participants (
  cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
)
SELECT
  cycle.id,
  role.user_id,
  'student',
  role.department_id,
  COALESCE(role.school_id, department.school_id),
  'existing',
  NULL
FROM internship_cycles cycle
JOIN user_roles role ON role.role = 'student'
JOIN users u ON u.id = role.user_id AND u.is_active = true
LEFT JOIN departments department ON department.id = role.department_id
WHERE cycle.status IN ('not_started', 'open')
ON CONFLICT (cycle_id, user_id) DO NOTHING;

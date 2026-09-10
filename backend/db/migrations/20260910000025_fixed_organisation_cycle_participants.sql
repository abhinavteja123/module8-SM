-- Organisation oversight is structural, not a manually assembled roster.
-- Every active Faculty Mentor, Faculty Coordinator, HOD, Dean and School Office
-- account is attached to each current/future (draft or open) cycle.

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

CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people_for_new_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM enrol_fixed_organisation_people(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internship_cycles_fixed_organisation_people ON internship_cycles;
CREATE TRIGGER internship_cycles_fixed_organisation_people
  AFTER INSERT ON internship_cycles
  FOR EACH ROW EXECUTE FUNCTION enrol_fixed_organisation_people_for_new_cycle();

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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_fixed_organisation_people ON user_roles;
CREATE TRIGGER user_roles_fixed_organisation_people
  AFTER INSERT OR UPDATE OF role, department_id, school_id ON user_roles
  FOR EACH ROW EXECUTE FUNCTION enrol_fixed_organisation_people_for_role();

-- Backfill the currently configured organisation onto every non-closed cycle.
DO $$
DECLARE cycle_row RECORD;
BEGIN
  FOR cycle_row IN SELECT id FROM internship_cycles WHERE status IN ('not_started', 'open') LOOP
    PERFORM enrol_fixed_organisation_people(cycle_row.id);
  END LOOP;
END;
$$;

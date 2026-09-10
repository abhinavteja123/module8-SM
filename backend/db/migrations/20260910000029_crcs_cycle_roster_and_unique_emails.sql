-- CRCS accounts are fixed organisation records for every active cycle, so
-- they appear in the selected-cycle All People directory alongside the other
-- organisation roles.
ALTER TABLE cycle_participants
  DROP CONSTRAINT IF EXISTS cycle_participants_participant_type_check;

ALTER TABLE cycle_participants
  ADD CONSTRAINT cycle_participants_participant_type_check
  CHECK (participant_type IN ('student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin'));

CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people(p_cycle_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO cycle_participants (
    cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
  )
  SELECT DISTINCT ON (ur.user_id)
    p_cycle_id, ur.user_id, ur.role, ur.department_id, COALESCE(ur.school_id, d.school_id), 'existing', NULL
  FROM user_roles ur
  JOIN users u ON u.id = ur.user_id AND u.is_active = true
  LEFT JOIN departments d ON d.id = ur.department_id
  WHERE ur.role IN ('faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin')
  ORDER BY ur.user_id,
    CASE ur.role
      WHEN 'crcs_superadmin' THEN 1
      WHEN 'crcs_coordinator' THEN 2
      WHEN 'faculty' THEN 3
      WHEN 'faculty_coordinator' THEN 4
      WHEN 'hod' THEN 5
      WHEN 'dean' THEN 6
      ELSE 7
    END
  ON CONFLICT (cycle_id, user_id) DO UPDATE SET
    participant_type = EXCLUDED.participant_type,
    department_id = EXCLUDED.department_id,
    school_id = EXCLUDED.school_id;
$$;

CREATE OR REPLACE FUNCTION enrol_fixed_organisation_people_for_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin') THEN
    INSERT INTO cycle_participants (
      cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
    )
    SELECT cycle.id, NEW.user_id, NEW.role, NEW.department_id, COALESCE(NEW.school_id, department.school_id), 'existing', NULL
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
    SELECT cycle.id, NEW.user_id, 'student', NEW.department_id, COALESCE(NEW.school_id, department.school_id), 'existing', NULL
    FROM internship_cycles cycle
    JOIN users u ON u.id = NEW.user_id AND u.is_active = true
    LEFT JOIN departments department ON department.id = NEW.department_id
    WHERE cycle.status = 'open'
    ON CONFLICT (cycle_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

SELECT enrol_fixed_organisation_people(id)
FROM internship_cycles
WHERE status IN ('not_started', 'open');

-- Email identity is case- and whitespace-insensitive throughout user create,
-- bulk import, profile editing, and login.
UPDATE users
SET email = lower(btrim(email))
WHERE email <> lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique_idx
  ON users (lower(btrim(email)));

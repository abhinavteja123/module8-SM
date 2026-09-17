-- enrol_fixed_organisation_people_for_role() enrolled a newly-created person
-- into every open/draft cycle system-wide, with no check that the cycle
-- belonged to the same university as the person — a real cross-tenant leak
-- (confirmed live: 45 SRM AP people wrongly enrolled in Test University's
-- cycle, 84 the other way). Scope the join by matching university_id.
CREATE OR REPLACE FUNCTION public.enrol_fixed_organisation_people_for_role()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.role IN ('faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin') THEN
    INSERT INTO cycle_participants (
      cycle_id, user_id, participant_type, department_id, school_id, source, enrolled_by
    )
    SELECT cycle.id, NEW.user_id, NEW.role, NEW.department_id, COALESCE(NEW.school_id, department.school_id), 'existing', NULL
    FROM internship_cycles cycle
    JOIN users u ON u.id = NEW.user_id AND u.is_active = true AND u.university_id = cycle.university_id
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
    JOIN users u ON u.id = NEW.user_id AND u.is_active = true AND u.university_id = cycle.university_id
    LEFT JOIN departments department ON department.id = NEW.department_id
    WHERE cycle.status = 'open'
    ON CONFLICT (cycle_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

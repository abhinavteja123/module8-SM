-- A faculty mentor belongs to one Faculty Coordinator, and a coordinator can
-- supervise no more than ten faculty mentors in their department.
CREATE UNIQUE INDEX IF NOT EXISTS faculty_coordinator_assignments_one_coordinator_per_faculty
  ON faculty_coordinator_assignments (faculty_id);

CREATE OR REPLACE FUNCTION enforce_faculty_coordinator_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM faculty_coordinator_assignments WHERE coordinator_id = NEW.coordinator_id) >= 10 THEN
    RAISE EXCEPTION 'A Faculty Coordinator can supervise at most 10 faculty mentors.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS faculty_coordinator_capacity_check ON faculty_coordinator_assignments;
CREATE TRIGGER faculty_coordinator_capacity_check
  BEFORE INSERT ON faculty_coordinator_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_faculty_coordinator_capacity();

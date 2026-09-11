-- Publish is one state transition: validation, closing the old open cycle,
-- opening the requested draft, and the audit record either all commit or all
-- roll back. The advisory lock serializes competing publish requests.
CREATE OR REPLACE FUNCTION publish_internship_cycle(p_cycle_id UUID, p_actor_id UUID)
RETURNS internship_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target internship_cycles;
  has_student BOOLEAN;
  has_faculty BOOLEAN;
  has_document BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('internship_cycle_publish'));
  SELECT * INTO target FROM internship_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'internship cycle not found'; END IF;
  IF target.status <> 'not_started' THEN RAISE EXCEPTION 'only a draft cycle can be published'; END IF;
  SELECT EXISTS(SELECT 1 FROM cycle_participants WHERE cycle_id = p_cycle_id AND participant_type = 'student') INTO has_student;
  SELECT EXISTS(SELECT 1 FROM cycle_participants WHERE cycle_id = p_cycle_id AND participant_type = 'faculty') INTO has_faculty;
  SELECT EXISTS(SELECT 1 FROM cycle_guideline_documents WHERE cycle_id = p_cycle_id AND is_required = true AND retired_at IS NULL) INTO has_document;
  IF NOT has_student THEN RAISE EXCEPTION 'enrol at least one student before publishing'; END IF;
  IF NOT has_faculty THEN RAISE EXCEPTION 'enrol at least one faculty member before publishing'; END IF;
  IF NOT has_document THEN RAISE EXCEPTION 'upload at least one required cycle document before publishing'; END IF;
  UPDATE internship_cycles SET status = 'closed' WHERE status = 'open' AND id <> p_cycle_id;
  UPDATE internship_cycles SET status = 'open' WHERE id = p_cycle_id RETURNING * INTO target;
  INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_actor_id, 'crcs_superadmin', 'publish_cycle', 'internship_cycles', p_cycle_id, jsonb_build_object('status', 'not_started'), jsonb_build_object('status', 'open'));
  RETURN target;
END;
$$;

REVOKE ALL ON FUNCTION publish_internship_cycle(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION publish_internship_cycle(UUID, UUID) TO service_role;

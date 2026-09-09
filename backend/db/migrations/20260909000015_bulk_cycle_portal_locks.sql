-- Server-side cycle locking keeps a 6,000+ user operation to one database call.
-- It also inserts one immutable audit event per lock that actually changes.
CREATE OR REPLACE FUNCTION bulk_set_cycle_portal_locks(
  p_cycle_id UUID,
  p_subject_type TEXT,
  p_locked BOOLEAN,
  p_reason TEXT,
  p_actor_id UUID,
  p_actor_role role_enum,
  p_department_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(affected_people INTEGER, changed_locks INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH subjects AS (
    SELECT DISTINCT selection.student_id AS subject_id
    FROM student_track_selections selection
    JOIN students student ON student.id = selection.student_id
    JOIN users person ON person.id = student.id AND person.is_active = true
    WHERE p_subject_type = 'student'
      AND selection.cycle_id = p_cycle_id
      AND (p_department_ids IS NULL OR student.department_id = ANY(p_department_ids))
    UNION
    SELECT faculty.id AS subject_id
    FROM faculty
    JOIN users person ON person.id = faculty.id AND person.is_active = true
    WHERE p_subject_type = 'faculty'
      AND (p_department_ids IS NULL OR faculty.department_id = ANY(p_department_ids))
  ), targets AS (
    SELECT subject_id, 'student_portal'::TEXT AS lock_type FROM subjects WHERE p_subject_type = 'student'
    UNION ALL SELECT subject_id, 'faculty_projects'::TEXT FROM subjects WHERE p_subject_type = 'faculty'
    UNION ALL SELECT subject_id, 'faculty_assignments'::TEXT FROM subjects WHERE p_subject_type = 'faculty'
    UNION ALL SELECT subject_id, 'faculty_marks'::TEXT FROM subjects WHERE p_subject_type = 'faculty'
  ), changed AS (
    SELECT target.subject_id, target.lock_type, old_lock.id AS old_id, old_lock.is_locked AS old_is_locked,
      old_lock.reason AS old_reason, old_lock.updated_at AS old_updated_at
    FROM targets target
    LEFT JOIN portal_locks old_lock ON old_lock.subject_id = target.subject_id AND old_lock.lock_type = target.lock_type
    WHERE old_lock.id IS NULL OR old_lock.is_locked IS DISTINCT FROM p_locked
  ), updated AS (
    INSERT INTO portal_locks (lock_type, subject_id, is_locked, reason, locked_by, locked_at, unlocked_by, unlocked_at, updated_at)
    SELECT lock_type, subject_id, p_locked, p_reason,
      CASE WHEN p_locked THEN p_actor_id ELSE NULL END,
      CASE WHEN p_locked THEN now() ELSE NULL END,
      CASE WHEN p_locked THEN NULL ELSE p_actor_id END,
      CASE WHEN p_locked THEN NULL ELSE now() END,
      now()
    FROM changed
    ON CONFLICT (lock_type, subject_id) DO UPDATE SET
      is_locked = EXCLUDED.is_locked,
      reason = EXCLUDED.reason,
      locked_by = CASE WHEN EXCLUDED.is_locked THEN EXCLUDED.locked_by ELSE portal_locks.locked_by END,
      locked_at = CASE WHEN EXCLUDED.is_locked THEN EXCLUDED.locked_at ELSE portal_locks.locked_at END,
      unlocked_by = CASE WHEN EXCLUDED.is_locked THEN NULL ELSE EXCLUDED.unlocked_by END,
      unlocked_at = CASE WHEN EXCLUDED.is_locked THEN NULL ELSE EXCLUDED.unlocked_at END,
      updated_at = EXCLUDED.updated_at
    RETURNING id, lock_type, subject_id, is_locked, reason
  ), audit AS (
    INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
    SELECT p_actor_id, p_actor_role,
      CASE WHEN p_locked THEN 'lock_' || updated.lock_type ELSE 'unlock_' || updated.lock_type END,
      'portal_locks', updated.id,
      CASE WHEN changed.old_id IS NULL THEN NULL ELSE jsonb_build_object('is_locked', changed.old_is_locked, 'reason', changed.old_reason, 'updated_at', changed.old_updated_at) END,
      jsonb_build_object('subject_id', updated.subject_id, 'lock_type', updated.lock_type, 'is_locked', updated.is_locked, 'reason', updated.reason, 'bulk_cycle_action', true)
    FROM updated JOIN changed ON changed.subject_id = updated.subject_id AND changed.lock_type = updated.lock_type
  )
  SELECT
    (SELECT COUNT(DISTINCT subject_id)::INTEGER FROM subjects),
    (SELECT COUNT(*)::INTEGER FROM updated);
END;
$$;

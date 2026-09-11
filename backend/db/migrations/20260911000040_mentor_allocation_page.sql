-- Database-paged union for the allocation queue.  This prevents a large
-- multi-pathway cycle from being truncated by PostgREST's default row limit
-- before the API can calculate a page.
CREATE OR REPLACE FUNCTION mentor_allocation_page(
  p_cycle_id UUID,
  p_department_ids UUID[] DEFAULT NULL,
  p_school_ids UUID[] DEFAULT NULL,
  p_faculty_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS TABLE(items JSONB, total BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_rows AS (
    SELECT oa.id, 'opportunity'::text AS type, oa.student_id, oa.assigned_mentor_id AS mentor_id,
      co.cycle_id, co.title, co.organization_name AS subtitle, oa.mentor_assigned_at AS last_updated_at
    FROM opportunity_applications oa JOIN crcs_opportunities co ON co.id = oa.opportunity_id
    WHERE oa.status = 'crcs_approved' AND co.cycle_id = p_cycle_id
    UNION ALL
    SELECT si.id, 'self_internship', si.student_id, si.assigned_mentor_id, si.cycle_id,
      si.company_name, 'Self-internship', si.mentor_assigned_at
    FROM self_internships si WHERE si.status = 'active' AND si.cycle_id = p_cycle_id
    UNION ALL
    SELECT ma.id, 'research', ma.student_id, ma.faculty_id, rp.cycle_id,
      rp.title, 'Research internship', ma.started_at
    FROM mentor_assignments ma
    JOIN research_applications ra ON ra.id = ma.research_application_id
    JOIN research_projects rp ON rp.id = ra.project_id
    WHERE ma.is_current = true AND rp.cycle_id = p_cycle_id
  ), scoped AS (
    SELECT r.*, u.full_name AS student_name, s.roll_number, s.department_id, d.school_id,
      mu.full_name AS mentor_name, mu.email AS mentor_email, f.cabin
    FROM all_rows r
    JOIN students s ON s.id = r.student_id
    JOIN users u ON u.id = r.student_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN users mu ON mu.id = r.mentor_id
    LEFT JOIN faculty f ON f.id = r.mentor_id
    WHERE (p_faculty_id IS NULL OR r.mentor_id = p_faculty_id)
      AND (p_department_ids IS NULL OR s.department_id = ANY(p_department_ids))
      AND (p_school_ids IS NULL OR d.school_id = ANY(p_school_ids))
      AND (COALESCE(trim(p_search), '') = '' OR concat_ws(' ', u.full_name, s.roll_number, mu.full_name, r.title) ILIKE '%' || trim(p_search) || '%')
  ), numbered AS (
    SELECT scoped.*, count(*) OVER () AS full_count,
      row_number() OVER (ORDER BY student_name, id) AS row_number
    FROM scoped
  ), page_rows AS (
    SELECT * FROM numbered
    WHERE row_number > (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
      AND row_number <= GREATEST(p_page, 1) * LEAST(GREATEST(p_page_size, 1), 100)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'type', type, 'cycle_id', cycle_id, 'student_id', student_id,
      'student', jsonb_build_object('id', student_id, 'full_name', student_name, 'roll_number', roll_number, 'department_id', department_id),
      'mentor_id', mentor_id, 'mentor', CASE WHEN mentor_id IS NULL THEN NULL ELSE jsonb_build_object('id', mentor_id, 'full_name', mentor_name, 'email', mentor_email, 'cabin', cabin) END,
      'title', title, 'subtitle', subtitle, 'last_updated_at', last_updated_at
    ) ORDER BY student_name, id), '[]'::jsonb), COALESCE(max(full_count), 0)::bigint
  FROM page_rows;
$$;

REVOKE ALL ON FUNCTION mentor_allocation_page(UUID, UUID[], UUID[], UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mentor_allocation_page(UUID, UUID[], UUID[], UUID, TEXT, INTEGER, INTEGER) TO service_role;

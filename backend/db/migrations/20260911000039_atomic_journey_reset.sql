-- Reset is transactional. Storage deletion is an idempotent, retryable job after commit.
CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.internship_cycles(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS storage_cleanup_jobs_pending_idx ON public.storage_cleanup_jobs(status,created_at);

-- Override evidence survives a reset; the reset audit also records the complete
-- pre-reset marks and component scores. Legacy mark IDs may become null.
ALTER TABLE public.marks_override_log ALTER COLUMN marks_id DROP NOT NULL;
ALTER TABLE public.marks_override_log DROP CONSTRAINT IF EXISTS marks_override_log_marks_id_fkey;
ALTER TABLE public.marks_override_log ADD CONSTRAINT marks_override_log_marks_id_fkey
  FOREIGN KEY (marks_id) REFERENCES public.marks(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.reset_student_cycle_journey(
  p_cycle_id uuid, p_student_id uuid, p_actor_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle public.internship_cycles%ROWTYPE;
  v_participant uuid;
  v_research uuid[];
  v_opportunities uuid[];
  v_self uuid[];
  v_entities uuid[];
  v_assignments uuid[];
  v_files jsonb;
  v_marks jsonb;
  v_scores jsonb;
  v_job uuid;
  v_documents integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=p_actor_id AND role='crcs_superadmin') THEN
    RAISE EXCEPTION 'Only CRCS Superadmin can reset a journey' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 OR length(p_reason)>2000 THEN
    RAISE EXCEPTION 'A reset reason is required' USING ERRCODE='22023';
  END IF;
  -- Publication uses this same lock; a reset must not race cycle closure.
  PERFORM pg_advisory_xact_lock(hashtext('internship_cycle_publish'));
  SELECT * INTO v_cycle FROM internship_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF NOT FOUND OR v_cycle.status<>'open' THEN
    RAISE EXCEPTION 'Only an open cycle can be reset' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_participant FROM cycle_participants
    WHERE cycle_id=p_cycle_id AND user_id=p_student_id AND participant_type='student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student is not enrolled in this cycle' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM students WHERE id=p_student_id FOR UPDATE;
  SELECT coalesce(array_agg(a.id),'{}') INTO v_research FROM research_applications a JOIN research_projects p ON p.id=a.project_id WHERE a.student_id=p_student_id AND p.cycle_id=p_cycle_id;
  SELECT coalesce(array_agg(a.id),'{}') INTO v_opportunities FROM opportunity_applications a JOIN crcs_opportunities o ON o.id=a.opportunity_id WHERE a.student_id=p_student_id AND o.cycle_id=p_cycle_id;
  SELECT coalesce(array_agg(id),'{}') INTO v_self FROM self_internships WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  v_entities := v_research || v_opportunities || v_self;
  SELECT coalesce(array_agg(id),'{}') INTO v_assignments FROM mentor_assignments WHERE student_id=p_student_id AND (research_application_id=ANY(v_research) OR related_entity_id=ANY(v_entities));
  SELECT coalesce(jsonb_agg(file_path),'[]'),count(*) INTO v_files,v_documents FROM documents WHERE student_id=p_student_id AND related_entity_id=ANY(v_entities);
  SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') INTO v_marks FROM marks m WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO v_scores FROM student_report_scores s WHERE student_id=p_student_id AND cycle_id=p_cycle_id;

  UPDATE research_projects p SET approved_count=greatest(0,p.approved_count-x.removed)
    FROM (SELECT project_id,count(*)::integer AS removed FROM research_applications WHERE id=ANY(v_research) AND status='crcs_approved' GROUP BY project_id) x WHERE p.id=x.project_id;
  DELETE FROM documents WHERE student_id=p_student_id AND related_entity_id=ANY(v_entities);
  DELETE FROM report_deadlines WHERE student_id=p_student_id AND (related_entity_id=ANY(v_entities) OR research_application_id=ANY(v_research));
  DELETE FROM weekly_attendance WHERE (student_id=p_student_id AND related_entity_id=ANY(v_entities)) OR mentor_assignment_id=ANY(v_assignments);
  -- Reassignment chains may reference an earlier assignment being removed.
  UPDATE mentor_assignments SET reassigned_from=NULL WHERE reassigned_from=ANY(v_assignments);
  DELETE FROM mentor_assignments WHERE id=ANY(v_assignments);
  DELETE FROM student_report_scores WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  DELETE FROM marks WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  DELETE FROM cycle_guideline_acknowledgements WHERE user_id=p_student_id AND cycle_id=p_cycle_id;
  DELETE FROM student_preference_change_requests WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  DELETE FROM self_internships WHERE id=ANY(v_self);
  DELETE FROM research_applications WHERE id=ANY(v_research);
  DELETE FROM opportunity_applications WHERE id=ANY(v_opportunities);
  DELETE FROM student_track_selections WHERE student_id=p_student_id AND cycle_id=p_cycle_id;
  UPDATE portal_locks SET is_locked=false,unlocked_by=p_actor_id,unlocked_at=now(),updated_at=now()
    WHERE lock_type='student_portal' AND subject_id=p_student_id AND is_locked;

  INSERT INTO storage_cleanup_jobs(cycle_id,student_id,file_paths,created_by)
    VALUES(p_cycle_id,p_student_id,v_files,p_actor_id) RETURNING id INTO v_job;
  INSERT INTO audit_log(actor_id,actor_role,action,entity_type,entity_id,old_value,new_value)
    VALUES(p_actor_id,'crcs_superadmin','reset_student_cycle_journey','cycle_participants',v_participant,
      jsonb_build_object('cycle_id',p_cycle_id,'student_id',p_student_id,'research_applications',cardinality(v_research),'opportunity_applications',cardinality(v_opportunities),'self_internships',cardinality(v_self),'documents',v_documents,'marks',v_marks,'component_scores',v_scores),
      jsonb_build_object('reason',trim(p_reason),'cycle_membership_retained',true,'storage_cleanup_job_id',v_job));
  RETURN jsonb_build_object('storage_cleanup_job_id',v_job,'documents',v_documents,'cycle_id',p_cycle_id,'student_id',p_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reset_student_cycle_journey(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_student_cycle_journey(uuid,uuid,uuid,text) TO service_role;

CREATE INDEX IF NOT EXISTS documents_student_entity_idx ON public.documents(student_id,related_entity_type,related_entity_id);
CREATE INDEX IF NOT EXISTS cycle_participants_cycle_type_user_idx ON public.cycle_participants(cycle_id,participant_type,user_id);
CREATE INDEX IF NOT EXISTS student_scores_cycle_student_idx ON public.student_report_scores(cycle_id,student_id);
NOTIFY pgrst, 'reload schema';

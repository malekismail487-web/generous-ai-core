
-- ════════════════════════════════════════════════════════════════════
-- STAGE 13 — Ministry-Grade Deployment Readiness
-- Four pillars: Outcome Validation, Curriculum Binding,
--               Teacher Override, Governance & Audit.
-- All tables follow strict isolation: school_id + RLS via existing
-- helpers (is_school_admin_of, has_role, can_view_student_mastery).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. CURRICULUM BINDING ──────────────────────────────────────────

CREATE TABLE public.curriculum_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,           -- e.g. 'KSA-NCF-2023', 'CCSS-Math'
  code TEXT NOT NULL,                -- e.g. 'MATH.G7.NS.1'
  grade_level TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  parent_id UUID REFERENCES public.curriculum_standards(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (framework, code, school_id)
);
GRANT SELECT ON public.curriculum_standards TO authenticated, anon;
GRANT ALL ON public.curriculum_standards TO service_role;
ALTER TABLE public.curriculum_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standards readable in-school or global"
  ON public.curriculum_standards FOR SELECT TO authenticated, anon
  USING (school_id IS NULL OR school_id = public.get_user_school_id(auth.uid()));
CREATE POLICY "school admins manage standards"
  ON public.curriculum_standards FOR ALL TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id));

CREATE TABLE public.learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id UUID NOT NULL REFERENCES public.curriculum_standards(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  bloom_level TEXT NOT NULL DEFAULT 'understand',  -- remember|understand|apply|analyze|evaluate|create
  textbook_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (standard_id, code)
);
GRANT SELECT ON public.learning_objectives TO authenticated, anon;
GRANT ALL ON public.learning_objectives TO service_role;
ALTER TABLE public.learning_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objectives follow parent standard"
  ON public.learning_objectives FOR SELECT TO authenticated, anon
  USING (EXISTS (
    SELECT 1 FROM public.curriculum_standards cs
    WHERE cs.id = standard_id
      AND (cs.school_id IS NULL OR cs.school_id = public.get_user_school_id(auth.uid()))
  ));
CREATE POLICY "school admins manage objectives"
  ON public.learning_objectives FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.curriculum_standards cs
    WHERE cs.id = standard_id AND cs.school_id IS NOT NULL
      AND public.is_school_admin_of(auth.uid(), cs.school_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.curriculum_standards cs
    WHERE cs.id = standard_id AND cs.school_id IS NOT NULL
      AND public.is_school_admin_of(auth.uid(), cs.school_id)
  ));

CREATE TABLE public.concept_standard_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  concept_key TEXT NOT NULL,         -- subject||topic OR concepts.id text
  standard_id UUID NOT NULL REFERENCES public.curriculum_standards(id) ON DELETE CASCADE,
  objective_id UUID REFERENCES public.learning_objectives(id) ON DELETE SET NULL,
  alignment_strength NUMERIC NOT NULL DEFAULT 1.0 CHECK (alignment_strength BETWEEN 0 AND 1),
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject, concept_key, standard_id, objective_id)
);
GRANT SELECT ON public.concept_standard_map TO authenticated;
GRANT ALL ON public.concept_standard_map TO service_role;
ALTER TABLE public.concept_standard_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "in-school read of mappings"
  ON public.concept_standard_map FOR SELECT TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id(auth.uid()));
CREATE POLICY "school admins manage mappings"
  ON public.concept_standard_map FOR ALL TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id));

CREATE TABLE public.lesson_objective_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  lesson_ref TEXT,                              -- explanation_id, lecture_id, etc.
  standard_id UUID REFERENCES public.curriculum_standards(id) ON DELETE SET NULL,
  objective_id UUID REFERENCES public.learning_objectives(id) ON DELETE SET NULL,
  standard_code TEXT,                           -- snapshot at generation time
  objective_code TEXT,
  framework TEXT,
  textbook_reference TEXT,
  alignment_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lesson_objective_bindings TO authenticated;
GRANT ALL ON public.lesson_objective_bindings TO service_role;
ALTER TABLE public.lesson_objective_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student or in-school read of bindings"
  ON public.lesson_objective_bindings FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
    OR public.can_view_student_mastery(auth.uid(), student_id)
  );

-- ─── 2. TEACHER OVERRIDE / HUMAN CONTROL ────────────────────────────

CREATE TABLE public.teacher_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('student','class','school')),
  student_id UUID,                              -- nullable for class/school
  class_id UUID,
  subject TEXT,
  topic TEXT,
  override_type TEXT NOT NULL CHECK (override_type IN (
    'difficulty_lock','pacing_lock','strategy_lock',
    'manual_lesson','freeze_progression','curriculum_pacing'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_overrides TO authenticated;
GRANT ALL ON public.teacher_overrides TO service_role;
ALTER TABLE public.teacher_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teachers manage own school overrides"
  ON public.teacher_overrides FOR ALL TO authenticated
  USING (
    public.is_school_admin_of(auth.uid(), school_id)
    OR (public.has_role(auth.uid(), 'teacher'::app_role)
        AND school_id = public.get_user_school_id(auth.uid()))
  )
  WITH CHECK (
    public.is_school_admin_of(auth.uid(), school_id)
    OR (public.has_role(auth.uid(), 'teacher'::app_role)
        AND school_id = public.get_user_school_id(auth.uid())
        AND teacher_id = auth.uid())
  );
CREATE POLICY "students read own overrides"
  ON public.teacher_overrides FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE INDEX idx_overrides_active ON public.teacher_overrides
  (school_id, active, scope, student_id, subject)
  WHERE active = true;

CREATE TABLE public.topic_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('student','class','school')),
  student_id UUID,
  class_id UUID,
  state TEXT NOT NULL CHECK (state IN ('locked','unlocked')) DEFAULT 'locked',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_locks TO authenticated;
GRANT ALL ON public.topic_locks TO service_role;
ALTER TABLE public.topic_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "in-school topic lock management"
  ON public.topic_locks FOR ALL TO authenticated
  USING (
    public.is_school_admin_of(auth.uid(), school_id)
    OR (public.has_role(auth.uid(), 'teacher'::app_role)
        AND school_id = public.get_user_school_id(auth.uid()))
  )
  WITH CHECK (
    public.is_school_admin_of(auth.uid(), school_id)
    OR (public.has_role(auth.uid(), 'teacher'::app_role)
        AND school_id = public.get_user_school_id(auth.uid())
        AND teacher_id = auth.uid())
  );
CREATE POLICY "students see locks affecting them"
  ON public.topic_locks FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ─── 3. OUTCOME VALIDATION / PILOT STUDIES ──────────────────────────

CREATE TABLE public.pilot_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  treatment_description TEXT NOT NULL DEFAULT 'Lumina adaptive',
  control_description TEXT NOT NULL DEFAULT 'Traditional teaching',
  subject TEXT,
  grade_level TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','running','closed','archived')) DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pilot_studies TO authenticated;
GRANT ALL ON public.pilot_studies TO service_role;
ALTER TABLE public.pilot_studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school admins manage pilots"
  ON public.pilot_studies FOR ALL TO authenticated
  USING (school_id IS NULL OR public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (school_id IS NULL OR public.is_school_admin_of(auth.uid(), school_id));

CREATE TABLE public.pilot_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id UUID NOT NULL REFERENCES public.pilot_studies(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  arm TEXT NOT NULL CHECK (arm IN ('treatment','control')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_assignments TO authenticated;
GRANT ALL ON public.pilot_assignments TO service_role;
ALTER TABLE public.pilot_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot assignments visible to admins or student"
  ON public.pilot_assignments FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.pilot_studies p
               WHERE p.id = pilot_id
                 AND (p.school_id IS NULL
                      OR public.is_school_admin_of(auth.uid(), p.school_id)))
  );
CREATE POLICY "admins write pilot assignments"
  ON public.pilot_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pilot_studies p
                 WHERE p.id = pilot_id
                   AND (p.school_id IS NULL
                        OR public.is_school_admin_of(auth.uid(), p.school_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pilot_studies p
                      WHERE p.id = pilot_id
                        AND (p.school_id IS NULL
                             OR public.is_school_admin_of(auth.uid(), p.school_id))));

CREATE TABLE public.assessment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id UUID REFERENCES public.pilot_studies(id) ON DELETE SET NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  subject TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('pretest','posttest','retention_7d','retention_14d','retention_30d')),
  score NUMERIC NOT NULL CHECK (score >= 0),
  total NUMERIC NOT NULL CHECK (total > 0),
  pct NUMERIC GENERATED ALWAYS AS (score / total) STORED,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.assessment_scores TO authenticated;
GRANT ALL ON public.assessment_scores TO service_role;
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own scores"
  ON public.assessment_scores FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
    OR public.can_view_student_mastery(auth.uid(), student_id)
  );
CREATE POLICY "teachers/admins record scores"
  ON public.assessment_scores FOR INSERT TO authenticated
  WITH CHECK (
    (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
    OR (public.has_role(auth.uid(), 'teacher'::app_role)
        AND school_id = public.get_user_school_id(auth.uid()))
  );

CREATE TABLE public.learning_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  baseline_mastery NUMERIC,
  current_mastery NUMERIC,
  mastery_delta NUMERIC,
  baseline_score NUMERIC,
  current_score NUMERIC,
  score_delta NUMERIC,
  time_to_mastery_sec NUMERIC,
  retention_7d NUMERIC,
  retention_14d NUMERIC,
  retention_30d NUMERIC,
  pilot_arm TEXT CHECK (pilot_arm IN ('treatment','control')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.learning_outcomes TO authenticated;
GRANT ALL ON public.learning_outcomes TO service_role;
ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outcome read scoping"
  ON public.learning_outcomes FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
    OR public.can_view_student_mastery(auth.uid(), student_id)
  );

-- ─── 4. GOVERNANCE / AUDIT / DATA EXPORT ────────────────────────────

CREATE TABLE public.governance_audit_trail (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_role TEXT,
  school_id UUID,
  action TEXT NOT NULL,            -- 'ai.lesson.generated','teacher.override.set','data.exported',...
  target_type TEXT,
  target_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.governance_audit_trail TO authenticated;
GRANT ALL ON public.governance_audit_trail TO service_role;
ALTER TABLE public.governance_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read own school audit"
  ON public.governance_audit_trail FOR SELECT TO authenticated
  USING (
    school_id IS NULL
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR public.is_super_admin_user(auth.uid())
  );
CREATE POLICY "any authenticated may append own audit row"
  ON public.governance_audit_trail FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

CREATE INDEX idx_audit_school_time ON public.governance_audit_trail (school_id, occurred_at DESC);
CREATE INDEX idx_audit_action      ON public.governance_audit_trail (action, occurred_at DESC);
CREATE INDEX idx_audit_target      ON public.governance_audit_trail (target_type, target_id);

CREATE TABLE public.data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('student','school')),
  target_id UUID,                    -- student_id or school_id
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')) DEFAULT 'pending',
  payload JSONB,                     -- inline export blob (small) OR pointer
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.data_export_requests TO authenticated;
GRANT ALL ON public.data_export_requests TO service_role;
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requester reads own exports"
  ON public.data_export_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
  );
CREATE POLICY "admin/teacher request exports"
  ON public.data_export_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      (school_id IS NOT NULL AND public.is_school_admin_of(auth.uid(), school_id))
      OR public.has_role(auth.uid(), 'teacher'::app_role)
      OR scope = 'student' AND target_id = auth.uid()
    )
  );

-- ─── Triggers: updated_at ───────────────────────────────────────────
CREATE TRIGGER trg_curriculum_standards_touch
  BEFORE UPDATE ON public.curriculum_standards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_teacher_overrides_touch
  BEFORE UPDATE ON public.teacher_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_topic_locks_touch
  BEFORE UPDATE ON public.topic_locks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pilot_studies_touch
  BEFORE UPDATE ON public.pilot_studies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

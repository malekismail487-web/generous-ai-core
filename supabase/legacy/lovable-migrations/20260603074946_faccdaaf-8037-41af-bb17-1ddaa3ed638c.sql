-- =========================================================================
-- LUMINA Curriculum Graph Extension Layer
-- Adds: lectures, concepts, curriculum_versions
-- Links: concept_mastery.concept_id (nullable, backward compatible)
-- Scope: school-isolated via subjects.school_id
-- =========================================================================

-- ---------- LECTURES ----------
CREATE TABLE public.lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  difficulty_level NUMERIC(4,2) NOT NULL DEFAULT 0.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lectures_subject ON public.lectures(subject_id);
CREATE INDEX idx_lectures_school  ON public.lectures(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lectures TO authenticated;
GRANT ALL ON public.lectures TO service_role;

ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lectures_select_same_school" ON public.lectures
  FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) OR public.is_super_admin_user(auth.uid()));

CREATE POLICY "lectures_write_school_staff" ON public.lectures
  FOR ALL TO authenticated
  USING (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))
  )
  WITH CHECK (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))
  );

CREATE TRIGGER trg_lectures_updated_at
  BEFORE UPDATE ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- CONCEPTS ----------
CREATE TABLE public.concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  difficulty_weight NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concepts_lecture ON public.concepts(lecture_id);
CREATE INDEX idx_concepts_subject ON public.concepts(subject_id);
CREATE INDEX idx_concepts_school  ON public.concepts(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.concepts TO authenticated;
GRANT ALL ON public.concepts TO service_role;

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concepts_select_same_school" ON public.concepts
  FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) OR public.is_super_admin_user(auth.uid()));

CREATE POLICY "concepts_write_school_staff" ON public.concepts
  FOR ALL TO authenticated
  USING (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))
  )
  WITH CHECK (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))
  );

CREATE TRIGGER trg_concepts_updated_at
  BEFORE UPDATE ON public.concepts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- LINK concept_mastery -> concepts (nullable, backward compatible) ----------
ALTER TABLE public.concept_mastery
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES public.concepts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_concept_mastery_concept ON public.concept_mastery(concept_id);

-- ---------- CURRICULUM VERSIONS (audit / rollback / simulation base) ----------
CREATE TABLE public.curriculum_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  version_label TEXT,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_curriculum_versions_school ON public.curriculum_versions(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_versions TO authenticated;
GRANT ALL ON public.curriculum_versions TO service_role;

ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curriculum_versions_select_same_school" ON public.curriculum_versions
  FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()) OR public.is_super_admin_user(auth.uid()));

CREATE POLICY "curriculum_versions_write_school_admin" ON public.curriculum_versions
  FOR ALL TO authenticated
  USING (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND public.is_school_admin_of(auth.uid(), school_id))
  )
  WITH CHECK (
    public.is_super_admin_user(auth.uid())
    OR (school_id = public.get_user_school_id(auth.uid())
        AND public.is_school_admin_of(auth.uid(), school_id))
  );

-- ---------- AUTO-FILL school_id / subject_id on insert (denormalization safety) ----------
CREATE OR REPLACE FUNCTION public.lectures_fill_school_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id FROM public.subjects WHERE id = NEW.subject_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lectures_fill_school
  BEFORE INSERT ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION public.lectures_fill_school_id();

CREATE OR REPLACE FUNCTION public.concepts_fill_parents()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subject_id IS NULL OR NEW.school_id IS NULL THEN
    SELECT subject_id, school_id INTO NEW.subject_id, NEW.school_id
    FROM public.lectures WHERE id = NEW.lecture_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_concepts_fill_parents
  BEFORE INSERT ON public.concepts
  FOR EACH ROW EXECUTE FUNCTION public.concepts_fill_parents();


-- =============================================================================
-- Phase T3 — Curriculum & Localisation Propagation
-- Each tenant owns its subject seed, grading scale, academic calendar, and
-- language defaults. Schools inherit these on creation. The client reads them
-- through a single `get_tenant_config()` RPC.
-- =============================================================================

-- 1) Extend tenants with a per-country subject seed ---------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_subjects jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tenants.default_subjects IS
  'Ordered list of subjects auto-seeded into every new school in this tenant. '
  'Each element: {"slug":"...","name":"...","emoji":"...","color":"..."}. '
  'Curriculum authors (T4) may extend or edit this per country.';

-- 2) Seed Saudi Arabia with its real curriculum, grading, and calendar --------
UPDATE public.tenants
   SET default_subjects = '[
        {"slug":"arabic","name":"اللغة العربية","emoji":"🕌","color":"from-amber-500 to-yellow-600"},
        {"slug":"islamic_studies","name":"Islamic Studies","emoji":"☪️","color":"from-green-600 to-emerald-700"},
        {"slug":"english","name":"English","emoji":"📚","color":"from-rose-500 to-pink-600"},
        {"slug":"mathematics","name":"Mathematics","emoji":"📐","color":"from-violet-500 to-purple-600"},
        {"slug":"biology","name":"Biology","emoji":"🧬","color":"from-emerald-500 to-green-600"},
        {"slug":"physics","name":"Physics","emoji":"⚛️","color":"from-blue-500 to-cyan-600"},
        {"slug":"chemistry","name":"Chemistry","emoji":"🧪","color":"from-orange-500 to-amber-600"},
        {"slug":"social_studies","name":"Social Studies","emoji":"🌍","color":"from-teal-500 to-emerald-600"},
        {"slug":"ksa_history","name":"KSA History","emoji":"🏛️","color":"from-amber-600 to-orange-700"},
        {"slug":"technology","name":"Technology","emoji":"💻","color":"from-indigo-500 to-blue-600"},
        {"slug":"art_design","name":"Art and Design","emoji":"🎨","color":"from-pink-500 to-rose-600"},
        {"slug":"entrepreneurship","name":"Entrepreneurship","emoji":"💼","color":"from-cyan-500 to-sky-600"}
      ]'::jsonb,
      grading_system = jsonb_build_object(
        'type', 'percentage',
        'pass_mark', 60,
        'scale', jsonb_build_array(
          jsonb_build_object('letter','A+','min',95,'gpa',4.0),
          jsonb_build_object('letter','A', 'min',90,'gpa',3.75),
          jsonb_build_object('letter','B+','min',85,'gpa',3.5),
          jsonb_build_object('letter','B', 'min',80,'gpa',3.0),
          jsonb_build_object('letter','C+','min',75,'gpa',2.5),
          jsonb_build_object('letter','C', 'min',70,'gpa',2.0),
          jsonb_build_object('letter','D+','min',65,'gpa',1.5),
          jsonb_build_object('letter','D', 'min',60,'gpa',1.0),
          jsonb_build_object('letter','F', 'min',0, 'gpa',0.0)
        )
      ),
      academic_calendar = jsonb_build_object(
        'year_start_month', 8,
        'year_end_month',   6,
        'week_start',       'sunday',
        'weekend',          jsonb_build_array('friday','saturday'),
        'terms', jsonb_build_array(
          jsonb_build_object('name','Term 1','start_month',8, 'end_month',12),
          jsonb_build_object('name','Term 2','start_month',1, 'end_month',3),
          jsonb_build_object('name','Term 3','start_month',3, 'end_month',6)
        )
      ),
      curriculum_framework = COALESCE(curriculum_framework, 'sa-moe-2024')
 WHERE slug = 'sa';

-- 3) Rewrite seed_default_subjects to be tenant-aware -------------------------
--   * Reads the school's tenant.default_subjects.
--   * Falls back to a minimal universal seed only if the tenant list is empty
--     (prevents empty-onboarding for a mis-configured tenant).
CREATE OR REPLACE FUNCTION public.seed_default_subjects(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_seed      jsonb;
  v_fallback  jsonb := '[
    {"slug":"mathematics","name":"Mathematics","emoji":"📐","color":"from-violet-500 to-purple-600"},
    {"slug":"english","name":"English","emoji":"📚","color":"from-rose-500 to-pink-600"},
    {"slug":"science","name":"Science","emoji":"🔬","color":"from-emerald-500 to-green-600"}
  ]'::jsonb;
  item jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.schools WHERE id = p_school_id;

  IF v_tenant_id IS NOT NULL THEN
    SELECT default_subjects INTO v_seed FROM public.tenants WHERE id = v_tenant_id;
  END IF;

  IF v_seed IS NULL OR jsonb_array_length(v_seed) = 0 THEN
    v_seed := v_fallback;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seed) LOOP
    INSERT INTO public.subjects(school_id, name, slug, emoji, color, is_default)
    VALUES (
      p_school_id,
      item->>'name',
      item->>'slug',
      COALESCE(item->>'emoji',''),
      COALESCE(item->>'color',''),
      true
    )
    ON CONFLICT (school_id, slug) WHERE slug IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

-- 4) get_tenant_config — one call returns the caller's country configuration --
CREATE OR REPLACE FUNCTION public.get_tenant_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_row public.tenants%ROWTYPE;
BEGIN
  v_tid := public.get_user_tenant_id(auth.uid());

  IF v_tid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.tenants WHERE id = v_tid;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',                   v_row.id,
    'slug',                 v_row.slug,
    'country_name',         v_row.country_name,
    'country_code',         v_row.country_code,
    'ministry_name',        v_row.ministry_name,
    'default_language',     v_row.default_language,
    'supported_languages',  to_jsonb(v_row.supported_languages),
    'curriculum_framework', v_row.curriculum_framework,
    'grading_system',       v_row.grading_system,
    'academic_calendar',    v_row.academic_calendar,
    'default_subjects',     v_row.default_subjects,
    'ai_config',            v_row.ai_config,
    'status',               v_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_config() TO authenticated;

COMMENT ON FUNCTION public.get_tenant_config() IS
  'Returns the caller''s tenant configuration (grading, calendar, subjects, '
  'languages, curriculum framework, AI config). NULL for users with no tenant '
  '(super admin, unassigned). Consumed by useTenantConfig() on the client.';

-- 5) Super Admin editor RPC for the per-country subject seed -----------------
CREATE OR REPLACE FUNCTION public.update_tenant_defaults(
  p_tenant_id uuid,
  p_default_subjects jsonb DEFAULT NULL,
  p_grading_system   jsonb DEFAULT NULL,
  p_academic_calendar jsonb DEFAULT NULL,
  p_default_language text  DEFAULT NULL,
  p_supported_languages text[] DEFAULT NULL,
  p_curriculum_framework text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
  END IF;

  UPDATE public.tenants SET
    default_subjects     = COALESCE(p_default_subjects,     default_subjects),
    grading_system       = COALESCE(p_grading_system,       grading_system),
    academic_calendar    = COALESCE(p_academic_calendar,    academic_calendar),
    default_language     = COALESCE(p_default_language,     default_language),
    supported_languages  = COALESCE(p_supported_languages,  supported_languages),
    curriculum_framework = COALESCE(p_curriculum_framework, curriculum_framework),
    updated_at           = now()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_defaults(
  uuid, jsonb, jsonb, jsonb, text, text[], text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_defaults(
  uuid, jsonb, jsonb, jsonb, text, text[], text
) TO authenticated;

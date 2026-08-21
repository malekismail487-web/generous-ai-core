CREATE OR REPLACE FUNCTION public.mi_tg_material_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_school uuid;
BEGIN
  BEGIN
    SELECT cm.school_id INTO v_school FROM public.course_materials cm WHERE cm.id = NEW.material_id;
  EXCEPTION WHEN OTHERS THEN v_school := NULL;
  END;
  IF v_school IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  END IF;
  PERFORM public.mi_emit_event(v_tenant, v_school, NULL, NULL, NULL,
    'material_view'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('material_id', NEW.material_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;
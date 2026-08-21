
ALTER TABLE public.fsrs_card_state
  ADD COLUMN IF NOT EXISTS is_leech           boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until    timestamptz,
  ADD COLUMN IF NOT EXISTS fuzzed_interval_days numeric(10,4),
  ADD COLUMN IF NOT EXISTS priority           numeric(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivered_at  timestamptz;

CREATE INDEX IF NOT EXISTS fsrs_card_state_priority
  ON public.fsrs_card_state (user_id, priority DESC);

CREATE INDEX IF NOT EXISTS fsrs_card_state_leech
  ON public.fsrs_card_state (user_id)
  WHERE is_leech = true;

CREATE OR REPLACE FUNCTION public.get_fsrs_due_cards(
  p_user_id   uuid,
  p_limit     integer DEFAULT 20,
  p_school_id uuid    DEFAULT NULL
)
RETURNS TABLE (
  card_id              uuid,
  subject              text,
  concept_id           uuid,
  concept_name         text,
  stability            numeric,
  difficulty           numeric,
  reps                 integer,
  lapses               integer,
  is_leech             boolean,
  last_review_at       timestamptz,
  next_review_at       timestamptz,
  overdue_hours        numeric,
  retrievability       numeric,
  priority             numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF auth.uid() <> p_user_id AND NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    f.id                                                AS card_id,
    f.subject,
    f.concept_id,
    COALESCE(c.name, f.subject)                         AS concept_name,
    f.stability,
    f.difficulty,
    f.reps,
    f.lapses,
    f.is_leech,
    f.last_review_at,
    f.next_review_at,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - f.next_review_at)) / 3600.0)::numeric AS overdue_hours,
    CASE
      WHEN f.last_review_at IS NULL OR f.stability <= 0 THEN 0.5
      ELSE GREATEST(0.01, LEAST(0.99,
             1.0 / (1.0 + GREATEST(0, EXTRACT(EPOCH FROM (now() - f.last_review_at)) / 86400.0)
                          / (9.0 * f.stability))))
    END                                                 AS retrievability,
    f.priority
  FROM public.fsrs_card_state f
  LEFT JOIN public.concepts c ON c.id = f.concept_id
  WHERE f.user_id = p_user_id
    AND (p_school_id IS NULL OR f.school_id = p_school_id)
    AND (f.suspended_until IS NULL OR f.suspended_until <= now())
    AND (f.next_review_at IS NULL OR f.next_review_at <= now())
  ORDER BY f.priority DESC NULLS LAST, f.next_review_at NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fsrs_due_cards(uuid, integer, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_fsrs_due_cards(uuid, integer, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.record_review_delivered(p_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.fsrs_card_state WHERE id = p_card_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF auth.uid() <> v_owner AND NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.fsrs_card_state
     SET last_delivered_at = now()
   WHERE id = p_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_review_delivered(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_review_delivered(uuid) FROM anon;

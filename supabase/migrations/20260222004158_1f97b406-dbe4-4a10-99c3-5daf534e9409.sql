
-- Announcement read receipts
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reads"
ON public.announcement_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reads"
ON public.announcement_reads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "School admins can view all reads for their announcements"
ON public.announcement_reads FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.announcements a
  WHERE a.id = announcement_reads.announcement_id
  AND is_school_admin_of(auth.uid(), a.school_id)
));

-- Trips table (same structure as announcements)
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins can manage trips"
ON public.trips FOR ALL
USING (is_school_admin_of(auth.uid(), school_id));

CREATE POLICY "Users can view trips in their school"
ON public.trips FOR SELECT
USING (school_id = get_user_school_id(auth.uid()));

-- Trip read receipts
CREATE TABLE public.trip_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

ALTER TABLE public.trip_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own trip reads"
ON public.trip_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own trip reads"
ON public.trip_reads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "School admins can view all trip reads"
ON public.trip_reads FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.trips t
  WHERE t.id = trip_reads.trip_id
  AND is_school_admin_of(auth.uid(), t.school_id)
));

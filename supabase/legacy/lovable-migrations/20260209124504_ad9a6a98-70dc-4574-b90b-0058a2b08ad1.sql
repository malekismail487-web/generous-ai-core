-- Allow school admins to INSERT, UPDATE, DELETE report cards
CREATE POLICY "School admins can manage report cards"
ON public.report_cards
FOR ALL
USING (is_school_admin_of(auth.uid(), school_id))
WITH CHECK (is_school_admin_of(auth.uid(), school_id));
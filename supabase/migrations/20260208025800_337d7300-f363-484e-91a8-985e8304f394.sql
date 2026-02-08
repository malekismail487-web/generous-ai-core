-- Add file_url column to report_cards table for file-based report cards
ALTER TABLE public.report_cards 
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Create storage bucket for report cards if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-cards', 'report-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for report-cards bucket
CREATE POLICY "School admins can upload report cards"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'report-cards' AND
  EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.user_id = auth.uid()
  )
);

CREATE POLICY "School admins can update report cards"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'report-cards' AND
  EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.user_id = auth.uid()
  )
);

CREATE POLICY "School admins can delete report cards"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'report-cards' AND
  EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.user_id = auth.uid()
  )
);

CREATE POLICY "Report cards are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'report-cards');
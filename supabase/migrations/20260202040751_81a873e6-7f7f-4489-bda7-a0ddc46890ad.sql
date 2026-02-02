-- Create storage bucket for course materials (PDF, Word, PowerPoint)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-materials', 
  'course-materials', 
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/gif']
);

-- RLS policies for course-materials bucket
CREATE POLICY "Anyone can view course materials"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-materials');

CREATE POLICY "Teachers can upload course materials"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-materials' 
  AND public.is_teacher(auth.uid())
);

CREATE POLICY "Teachers can update their own materials"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'course-materials' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Teachers can delete their own materials"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-materials' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add questions_json column to assignments table for storing questions
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS questions_json jsonb DEFAULT '[]'::jsonb;
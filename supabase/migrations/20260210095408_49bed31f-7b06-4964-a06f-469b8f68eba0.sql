-- Fix: Change foreign key from auth.users to profiles
ALTER TABLE public.report_cards DROP CONSTRAINT report_cards_student_id_fkey;
ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
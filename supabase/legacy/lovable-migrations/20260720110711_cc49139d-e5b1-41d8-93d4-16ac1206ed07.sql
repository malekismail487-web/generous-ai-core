
REVOKE ALL ON FUNCTION public.mi_tg_assignment_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_exam_submission()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_material_view()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_lesson_event()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_chat_message()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_saved_lecture()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_tg_course_material()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_hash_student(uuid, uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mi_school_region(uuid)        FROM PUBLIC, anon, authenticated;

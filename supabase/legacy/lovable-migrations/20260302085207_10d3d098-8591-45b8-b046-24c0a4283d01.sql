-- Grant anon and authenticated roles permission to call ministry RPC functions
GRANT EXECUTE ON FUNCTION public.verify_ministry_code(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_ministry_code(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ministry_ip_ban(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_ministry_ip_ban(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ministry_session(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_ministry_session(text) TO authenticated;
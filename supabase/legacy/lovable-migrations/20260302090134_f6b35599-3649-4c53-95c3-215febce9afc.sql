GRANT EXECUTE ON FUNCTION public.get_ministry_dashboard_data(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ministry_dashboard_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ministry_request(uuid, text) TO authenticated;
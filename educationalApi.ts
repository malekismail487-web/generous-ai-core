import { supabase } from "@/integrations/supabase/client";
import type { School, Profile, InviteCode, InviteRequest, UserRole } from "@/types/education";

export async function getCurrentUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data as Profile;
}

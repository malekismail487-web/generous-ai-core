import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ActivateSchoolBody = {
  schoolName: string;
  activationCode: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing backend env vars", {
        hasUrl: !!SUPABASE_URL,
        hasAnon: !!SUPABASE_ANON_KEY,
        hasService: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return new Response(JSON.stringify({ error: "Backend not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();

    if (userError || !user) {
      console.warn("activate-school: unauthenticated", userError?.message);
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Partial<ActivateSchoolBody>;
    const schoolName = (body.schoolName ?? "").trim();
    const activationCode = (body.activationCode ?? "").trim().toUpperCase();

    if (!schoolName || !activationCode) {
      return new Response(
        JSON.stringify({ error: "School name and activation code are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("activate-school: verifying code", {
      userId: user.id,
      schoolName,
      activationCode,
    });

    const { data: school, error: schoolError } = await admin
      .from("schools")
      .select("id,name,activation_code,code_used,status")
      .ilike("name", schoolName)
      .eq("activation_code", activationCode)
      .eq("code_used", false)
      .eq("status", "active")
      .maybeSingle();

    if (schoolError) {
      console.error("activate-school: school lookup error", schoolError);
      return new Response(JSON.stringify({ error: schoolError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!school) {
      return new Response(
        JSON.stringify({
          error:
            "School name and activation code do not match, or the code has already been used.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1) Mark code as used
    const { error: markError } = await admin
      .from("schools")
      .update({
        code_used: true,
        code_used_by: user.id,
        code_used_at: new Date().toISOString(),
      })
      .eq("id", school.id)
      .eq("code_used", false);

    if (markError) {
      console.error("activate-school: failed marking code_used", markError);
      return new Response(JSON.stringify({ error: markError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Upsert profile as school_admin
    const fullName =
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "") ||
      user.email ||
      "School Admin";

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        school_id: school.id,
        full_name: fullName,
        user_type: "school_admin",
        status: "approved",
        is_active: true,
        email: user.email,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.error("activate-school: upsert profile failed", profileError);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Roles/admin tables
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: user.id, role: "admin" });

    if (roleError && roleError.code !== "23505") {
      console.error("activate-school: insert role failed", roleError);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: schoolAdminError } = await admin
      .from("school_admins")
      .insert({ user_id: user.id, school_id: school.id });

    if (schoolAdminError && schoolAdminError.code !== "23505") {
      console.error("activate-school: insert school_admins failed", schoolAdminError);
      return new Response(JSON.stringify({ error: schoolAdminError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("activate-school: success", { userId: user.id, schoolId: school.id });
    return new Response(
      JSON.stringify({ success: true, school_id: school.id, school_name: school.name }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("activate-school: unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// mi-aggregate: nightly Ministry Intelligence rollup job.
// Invoked by pg_cron. Aggregates the previous day's mi_educational_events
// into mi_daily_rollups by calling the mi_run_daily_aggregation SQL function.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  let targetDay: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.day === "string") targetDay = body.day;
    }
  } catch (_) { /* body optional */ }

  const { data, error } = await client.rpc("mi_run_daily_aggregation", {
    _target_day: targetDay ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  if (error) {
    console.error("mi-aggregate failed", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
